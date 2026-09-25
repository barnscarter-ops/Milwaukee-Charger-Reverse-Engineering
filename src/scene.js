// Three.js scene for the Board Atlas: board body, photo skins, part models, hotspots, labels, camera.
// Renders on demand: a frame is drawn only when something changed (input, damping, tweens, hover).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIZE, THICKNESS, outline, holes, isolation, textures, halfExtent, footprintCentre } from './board-data.js';
import { K, buildPart } from './parts.js';
import { onBoard, polygonCentroid } from './geometry.js';

const T = THICKNESS * K;
const [CX, CY] = polygonCentroid(outline);
const BOARD = { outline, holes };
export const toScene = (x, y) => [(x - CX) * K, (y - CY) * K];
const toBoard = (X, Z) => [X / K + CX, Z / K + CY];

const CONF_COLOR = { unknown: new THREE.Color(0xeef3ea), probable: new THREE.Color(0xf2b84b), confirmed: new THREE.Color(0x5ad492) };
const HOVER_COLOR = new THREE.Color(0xffffff);
const SELECT_COLOR = new THREE.Color(0xffd27a);
const ROUND = new Set(['elcap', 'fuse', 'graycyl', 'led', 'pad', 'tp', 'marker', 'smd-custom']);
const VIEWS = {
  plan: { phi: 0.0001, theta: 0, lift: 0 },
  three: { phi: THREE.MathUtils.degToRad(52), theta: THREE.MathUtils.degToRad(-24), lift: 0.35 },
  edge: { phi: THREE.MathUtils.degToRad(83), theta: THREE.MathUtils.degToRad(-8), lift: 0.55 }
};
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- small geometry helpers ----------
function shapeFrom(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => { const [X, Z] = toScene(x, y); i ? s.lineTo(X, -Z) : s.moveTo(X, -Z); });
  s.closePath();
  return s;
}

function boardShape() {
  const shape = shapeFrom(outline);
  for (const h of holes) { const p = new THREE.Path(); h.forEach(([x, y], i) => { const [X, Z] = toScene(x, y); i ? p.lineTo(X, -Z) : p.moveTo(X, -Z); }); p.closePath(); shape.holes.push(p); }
  return shape;
}

/** Flat skin for one face, UV-mapped to the shared photo frame (u = x / W, v = 1 - y / H). */
function skinGeometry(shape, up) {
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position'), uv = g.getAttribute('uv'), nrm = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const [x, y] = toBoard(pos.getX(i), pos.getZ(i));
    uv.setXY(i, x / SIZE.w, 1 - y / SIZE.h);
    pos.setY(i, up ? T / 2 : -T / 2);
    nrm.setXYZ(i, 0, up ? 1 : -1, 0);
  }
  if (!up) {
    const idx = g.getIndex();
    for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  }
  g.computeBoundingSphere();
  return g;
}

/** Board edge walls: laminate colour with a thin solder-mask layer on the solder side. */
function wallGeometry() {
  const rings = [outline, ...holes];
  const pos = [], nrm = [], col = [];
  const laminate = new THREE.Color(0xc8b48c), mask = new THREE.Color(0x1f6f4f), rim = new THREE.Color(0xe2d4b0);
  const bands = [[-T / 2, -T / 2 + T * 0.1, mask], [-T / 2 + T * 0.1, T / 2 - T * 0.06, laminate], [T / 2 - T * 0.06, T / 2, rim]];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const [ax, az] = toScene(a[0], a[1]), [bx, bz] = toScene(b[0], b[1]);
      const len = Math.hypot(bx - ax, bz - az); if (len < 1e-6) continue;
      let nx = (bz - az) / len, nz = -(bx - ax) / len;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (onBoard(mx + nx * 1.5, my + nz * 1.5, BOARD)) { nx = -nx; nz = -nz; }
      const facing = ((bx - ax) * nz - (bz - az) * nx) > 0;
      for (const [y0, y1, c] of bands) {
        const quad = [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]];
        const tri = facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const k of tri) { pos.push(...quad[k]); nrm.push(nx, 0, nz); col.push(c.r, c.g, c.b); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Rounded-rectangle ribbon (a flat outline) in the XZ plane, centred on the origin. */
function ribbonGeometry(hx, hz, radius, width) {
  const r = Math.min(radius, hx, hz), steps = 10, pts = [];
  const corners = [[hx - r, hz - r, 0], [-hx + r, hz - r, Math.PI / 2], [-hx + r, -hz + r, Math.PI], [hx - r, -hz + r, Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= steps; i++) { const a = a0 + (i / steps) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); }
  const pos = [], idx = [];
  pts.forEach(([x, z, dx, dz]) => { pos.push(x + dx * width / 2, 0, z + dz * width / 2, x - dx * width / 2, 0, z - dz * width / 2); });
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; idx.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Hotspot marker: faint fill, crisp ring, dark halo so it reads on both the cream and the green face. */
function hotspotGeometry() {
  const parts = [[0, 0.6, [1, 1, 1, 0.2]], [0.6, 1, [1, 1, 1, 1]], [1, 1.32, [0, 0, 0, 0.42]]].map(([a, b, rgba]) => {
    const g = new THREE.RingGeometry(a, b, 36, 1);
    g.rotateX(-Math.PI / 2);
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => rgba).flat(), 4));
    return g;
  });
  return mergeGeometries(parts);
}

// ---------- overlay shader shared by both photo skins (X-ray see-through and isolation zones) ----------
const OVERLAY_UNIFORMS = `
uniform sampler2D xrayMap; uniform float xrayAmount; uniform vec3 xrayLens;
uniform float zoneOn; uniform sampler2D zoneMap; uniform vec2 boardSize;`;
const OVERLAY_GLSL = `
{
  vec2 bp = vec2(vMapUv.x * boardSize.x, (1.0 - vMapUv.y) * boardSize.y);
  if (xrayAmount > 0.0) {
    float w = xrayAmount;
    float rim = 0.0;
    if (xrayLens.z > 0.0) {
      float d = distance(bp, xrayLens.xy);
      w *= 1.0 - smoothstep(xrayLens.z - 4.0, xrayLens.z, d);
      rim = smoothstep(xrayLens.z - 7.0, xrayLens.z - 4.0, d) * (1.0 - smoothstep(xrayLens.z + 1.0, xrayLens.z + 4.0, d));
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(xrayMap, vMapUv).rgb, w);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.72, 0.30), rim * 0.95);
  }
  if (zoneOn > 0.5) {
    vec3 z = texture2D(zoneMap, vMapUv).rgb;
    float stripe = step(0.5, fract((bp.x + bp.y) / 16.0));
    float band = smoothstep(0.25, 0.45, z.b), edge = smoothstep(0.72, 0.9, z.b);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.24, 0.12), z.r * 0.34);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.45, 0.95), z.g * 0.26);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.72, 0.08), band * (0.22 + 0.5 * stripe));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.78, 0.12), edge * 0.95);
  }
}`;

function zoneTexture() {
  const w = 512, h = Math.round(512 * SIZE.h / SIZE.w), s = w / SIZE.w;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  const path = pts => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s))); c.closePath(); };
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  if (isolation) {
    c.fillStyle = '#00ff00'; path(outline); c.fill();
    c.fillStyle = '#ff0000'; path(isolation.primary); c.fill();
    c.fillStyle = 'rgb(0,0,140)'; path(isolation.barrier); c.fill();
    c.strokeStyle = 'rgb(0,0,255)'; c.lineWidth = 5 * s; c.lineJoin = 'round'; path(isolation.barrier); c.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---------- the atlas ----------
export function createAtlas({ host, onTap, onHover, onLabelTap, onStatus }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  // Capped at 1.5: on 2x screens this halves the fill cost with little visible loss (MSAA is on).
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of the charger board');
  host.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  host.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 0.9;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minDistance = 2.2;
  controls.maxDistance = 42;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86);

  scene.add(new THREE.HemisphereLight(0xf6f2e8, 0x2b3532, 0.85));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.2);
  key.position.set(-4, 13, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 0.55);
  rim.position.set(7, 6, -9);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.24 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const assembly = new THREE.Group();
  scene.add(assembly);

  // ---- board body and skins ----
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.colorSpace = THREE.SRGBColorSpace; white.needsUpdate = true;
  const uniforms = {
    xrayAmount: { value: 0 }, xrayLens: { value: new THREE.Vector3(0, 0, 0) },
    zoneOn: { value: 0 }, zoneMap: { value: zoneTexture() }, boardSize: { value: new THREE.Vector2(SIZE.w, SIZE.h) }
  };
  const PLAIN = { top: new THREE.Color(0xdccfa9), bottom: new THREE.Color(0x2a7a58) };
  function skinMaterial(face) {
    const m = new THREE.MeshStandardMaterial({ map: white, color: PLAIN[face], roughness: face === 'top' ? 0.86 : 0.62, metalness: 0 });
    m.userData.other = { value: white };
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms, { xrayMap: m.userData.other });
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${OVERLAY_UNIFORMS}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${OVERLAY_GLSL}`);
    };
    m.customProgramCacheKey = () => 'board-skin';
    return m;
  }
  const skinMat = { top: skinMaterial('top'), bottom: skinMaterial('bottom') };
  const shape = boardShape();
  const topSkin = new THREE.Mesh(skinGeometry(shape, true), skinMat.top);
  const bottomSkin = new THREE.Mesh(skinGeometry(shape, false), skinMat.bottom);
  for (const s of [topSkin, bottomSkin]) { s.receiveShadow = true; s.castShadow = true; s.userData.board = true; assembly.add(s); }
  const walls = new THREE.Mesh(wallGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  walls.castShadow = true; walls.receiveShadow = true;
  assembly.add(walls);

  const photo = { top: null, bottom: null, on: true, failed: false };
  function applySurface() {
    for (const face of ['top', 'bottom']) {
      const m = skinMat[face], other = face === 'top' ? 'bottom' : 'top';
      const use = photo.on && photo[face];
      m.map = use ? photo[face] : white;
      m.color.copy(use ? new THREE.Color(0xffffff) : PLAIN[face]);
      m.userData.other.value = photo.on && photo[other] ? photo[other] : white;
    }
    invalidate();
  }

  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onStatus?.({ type: 'progress', loaded, total });
  manager.onLoad = () => {
    for (const t of [photo.top, photo.bottom]) if (t) renderer.initTexture(t);
    applySurface();
    onStatus?.({ type: photo.failed ? 'error' : 'ready' });
  };
  manager.onError = url => { photo.failed = true; onStatus?.({ type: 'texture-error', url }); };
  const loader = new THREE.TextureLoader(manager);
  for (const face of ['top', 'bottom']) {
    loader.load(textures[face], tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      photo[face] = tex;
    });
  }

  // ---- parts ----
  const entries = new Map();       // key -> entry
  const bodyMeshes = { top: [], bottom: [] };
  const lowPoints = [];             // assembly-local boxes [x0, x1, y0, y1] that keep the floor under the lowest geometry
  const xrayGhost = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.14, roughness: 0.3, depthWrite: false });
  const box = new THREE.Box3();

  lowPoints.push(-CX * K, (SIZE.w - CX) * K, -T / 2, T / 2);

  function placeGroup(e) {
    const [ax, ay] = e.p.kind === 'bracket' ? [e.x - (e.p.x + e.p.foot_x1) / 2 + e.p.x, e.y - (e.p.y0 + e.p.y1) / 2 + e.p.y0] : [e.x, e.y];
    const [X, Z] = toScene(ax, ay);
    e.group.position.set(X, e.side === 'top' ? T / 2 : -T / 2, Z);
  }

  function addEntry(p, conf = 'unknown') {
    const [fx, fy] = footprintCentre(p);
    const e = { key: p.id, p, side: p.side, x: fx, y: fy, he: halfExtent(p), group: null, height: 0.02, hotspot: -1, label: null, conf, custom: !!p.custom };
    const g = p.custom ? null : buildPart(p);
    if (g) {
      box.setFromObject(g);
      e.height = box.max.y;
      if (p.side === 'bottom') g.scale.y = -1;
      e.group = g;
      g.traverse(o => {
        if (!o.isMesh) return;
        o.userData.partKey = p.id;
        o.userData.baseMaterial = o.material;
        o.userData.baseShadow = o.castShadow;
        bodyMeshes[p.side].push(o);
      });
      placeGroup(e);
      assembly.add(g);
      const [X] = toScene(fx, fy);
      const hx = e.he[0] * K;
      if (p.side === 'top') lowPoints.push(X - hx, X + hx, T / 2, T / 2 + e.height);
      else lowPoints.push(X - hx, X + hx, -T / 2 - e.height, -T / 2);
    }
    entries.set(p.id, e);
    return e;
  }

  // ---- hotspots (one instanced draw call for every small part on both faces) ----
  const HOT_CAP = 420;
  const hotspots = new THREE.InstancedMesh(hotspotGeometry(), new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4
  }), HOT_CAP);
  hotspots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hotspots.count = 0;
  hotspots.frustumCulled = false;
  hotspots.renderOrder = 2;
  assembly.add(hotspots);
  const hotKeys = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), tmpColor = new THREE.Color();
  const hotRadius = e => THREE.MathUtils.clamp(Math.max(e.he[0], e.he[1]) * 0.72, 7.5, 13) * K;

  function writeHotspot(e) {
    if (e.hotspot < 0) return;
    const sel = e.key === state.selected, hov = e.key === state.hovered;
    const r = hotRadius(e) * (sel ? 1.45 : hov ? 1.3 : 1);
    const [X, Z] = toScene(e.x, e.y);
    v3.set(X, e.side === 'top' ? T / 2 + 0.003 : -T / 2 - 0.003, Z);
    hotspots.setMatrixAt(e.hotspot, m4.compose(v3, q, s3.set(r, r, r)));
    tmpColor.copy(CONF_COLOR[e.conf] || CONF_COLOR.unknown);
    if (sel) tmpColor.copy(SELECT_COLOR); else if (hov) tmpColor.lerp(HOVER_COLOR, 0.6);
    hotspots.setColorAt(e.hotspot, tmpColor);
    hotspots.instanceMatrix.needsUpdate = true;
    if (hotspots.instanceColor) hotspots.instanceColor.needsUpdate = true;
  }

  function rebuildHotspots() {
    hotKeys.length = 0;
    for (const e of entries.values()) {
      e.hotspot = -1;
      if (e.group || e.unplaced || hotKeys.length >= HOT_CAP) continue;
      e.hotspot = hotKeys.length; hotKeys.push(e.key);
      writeHotspot(e);
    }
    hotspots.count = hotKeys.length;
    invalidate();
  }

  // ---- selection / hover outlines ----
  const selMat = new THREE.MeshBasicMaterial({ color: 0xffcf6e, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, side: THREE.DoubleSide });
  const hovMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, side: THREE.DoubleSide });
  const selRing = new THREE.Mesh(new THREE.BufferGeometry(), selMat);
  const hovRing = new THREE.Mesh(new THREE.BufferGeometry(), hovMat);
  for (const r of [selRing, hovRing]) { r.visible = false; r.renderOrder = 3; assembly.add(r); }

  function outlineFor(ring, e, width) {
    ring.geometry.dispose();
    if (!e || e.unplaced) { ring.visible = false; return; }
    const pad = e.hotspot >= 0 ? 0 : 0.05;
    const hx = e.hotspot >= 0 ? hotRadius(e) * 1.75 : e.he[0] * K + pad, hz = e.hotspot >= 0 ? hotRadius(e) * 1.75 : e.he[1] * K + pad;
    const round = e.hotspot >= 0 || ROUND.has(e.p.kind);
    ring.geometry = ribbonGeometry(hx, hz, round ? Math.max(hx, hz) : Math.min(hx, hz) * 0.3, width);
    const [X, Z] = toScene(e.x, e.y);
    ring.position.set(X, e.side === 'top' ? T / 2 + 0.004 : -T / 2 - 0.004, Z);
    ring.visible = true;
  }

  // ---- labels (CSS2D chips; created on demand, decluttered every frame) ----
  const labelEls = new Map();
  const activeLabels = new Set();
  function labelFor(e) {
    if (e.label) return e.label;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'chip';
    el.tabIndex = -1;
    el.innerHTML = `<span class="chip-dot"></span><span class="chip-id"></span>`;
    el.querySelector('.chip-id').textContent = e.key;
    el.addEventListener('click', ev => { ev.stopPropagation(); onLabelTap?.(e.key); });
    el.addEventListener('pointerenter', () => setHover(e.key, true));
    el.addEventListener('pointerleave', () => setHover(null, true));
    const obj = new CSS2DObject(el);
    obj.center.set(0.5, 1);
    obj.userData = { key: e.key, width: 7.6 * e.key.length + 28, culled: false };
    e.label = obj;
    labelEls.set(e.key, el);
    return obj;
  }
  function positionLabel(e) {
    if (!e.label) return;
    const s = e.side === 'top' ? 1 : -1;
    const [X, Z] = toScene(e.x, e.y);
    e.label.position.set(X, s * (T / 2 + e.height + 0.05), Z);
  }

  const zoneLabels = [];
  if (isolation) {
    for (const [text, cls, x, y] of [['Primary side', 'zone-primary', 700, 690], ['Isolation barrier', 'zone-barrier', 588, 790], ['Secondary side', 'zone-secondary', 150, 1150]]) {
      const el = document.createElement('div');
      el.className = `zone-chip ${cls}`;
      el.textContent = text;
      const obj = new CSS2DObject(el);
      obj.center.set(0.5, 0.5);
      obj.userData = { x, y };
      zoneLabels.push(obj);
    }
  }

  const state = {
    side: 'top', selected: null, hovered: null, allLabels: false, keyParts: new Set(), flipping: false,
    view: 'three', userMoved: false, zones: false, xray: false, lens: true, xrayAmount: 0.85, links: false, highlightNet: null
  };

  function syncLabels() {
    const want = new Set();
    if (!state.flipping) {
      for (const e of entries.values()) {
        if (e.side !== state.side || e.unplaced) continue;
        if (state.allLabels || state.keyParts.has(e.key) || e.key === state.selected || e.key === state.hovered || state.pinned?.has(e.key)) want.add(e.key);
      }
    }
    for (const k of activeLabels) if (!want.has(k)) { const e = entries.get(k); if (e?.label) assembly.remove(e.label); activeLabels.delete(k); }
    for (const k of want) {
      const e = entries.get(k); const obj = labelFor(e);
      positionLabel(e);
      if (!activeLabels.has(k)) { assembly.add(obj); activeLabels.add(k); }
      const el = labelEls.get(k);
      el.dataset.conf = e.conf;
      el.classList.toggle('is-selected', k === state.selected);
      el.classList.toggle('is-hovered', k === state.hovered);
      el.classList.toggle('is-key', state.keyParts.has(k));
    }
    for (const z of zoneLabels) {
      const show = state.zones && !state.flipping;
      if (show && !z.parent) assembly.add(z); else if (!show && z.parent) assembly.remove(z);
      const s = state.side === 'top' ? 1 : -1;
      const [X, Z] = toScene(z.userData.x, z.userData.y);
      z.position.set(X, s * (T / 2 + 0.02), Z);
    }
    invalidate();
  }

  const proj = new THREE.Vector3();
  function declutter() {
    const w = host.clientWidth, h = host.clientHeight;
    const placed = [];
    const rects = [];
    const screen = obj => { proj.setFromMatrixPosition(obj.matrixWorld).project(camera); return [(proj.x * 0.5 + 0.5) * w, (-proj.y * 0.5 + 0.5) * h]; };
    // Zone chips rank just below the selected and hovered labels, above everything else.
    for (const z of zoneLabels) {
      if (!z.parent) continue;
      const [x, y] = screen(z);
      const half = (z.element.offsetWidth || 140) / 2;
      rects.push({ obj: z, pr: 2.8, area: 0, x0: x - half, y0: y - 13, x1: x + half, y1: y + 13 });
    }
    for (const k of activeLabels) {
      const e = entries.get(k); const obj = e.label;
      const [x, y] = screen(obj);
      const pr = k === state.selected ? 4 : k === state.hovered ? 3 : state.pinned?.has(k) ? 2.5 : state.keyParts.has(k) ? 2 : 1;
      rects.push({ obj, pr, area: e.he[0] * e.he[1], x0: x - obj.userData.width / 2, y0: y - 32, x1: x + obj.userData.width / 2, y1: y - 9 });
    }
    rects.sort((a, b) => b.pr - a.pr || b.area - a.area);
    for (const r of rects) {
      const hit = r.pr < 3 && placed.some(p => r.x0 < p[2] + 2 && r.x1 > p[0] - 2 && r.y0 < p[3] + 2 && r.y1 > p[1] - 2);
      if (!hit) placed.push([r.x0, r.y0, r.x1, r.y1]);
      if (r.obj.userData.culled !== hit) { r.obj.userData.culled = hit; r.obj.element.classList.toggle('is-culled', hit); }
    }
  }

  // ---- continuity links ----
  const linkGroup = new THREE.Group();
  assembly.add(linkGroup);
  // Annotation overlay: drawn after the scene without depth testing so a reading stays visible behind tall parts.
  const linkMat = (color, opacity = 0.95) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
  const linkMats = { continuity: linkMat(0x3fd6c4), resistance: linkMat(0x8fb0ff), open: linkMat(0xb3bcb8, 0.6), cross: linkMat(0xff5a45), dim: linkMat(0x6f7c78, 0.3) };
  linkGroup.renderOrder = 4;
  const endGeo = new THREE.SphereGeometry(0.06, 16, 10);
  let lastLinks = [];
  function drawLinks(links = lastLinks) {
    lastLinks = links;
    for (const c of [...linkGroup.children]) { linkGroup.remove(c); if (c.geometry !== endGeo) c.geometry.dispose(); }
    if (!state.links) { invalidate(); return; }
    const s = state.side === 'top' ? 1 : -1, base = s * (T / 2 + 0.012);
    for (const l of links) {
      const a = entries.get(l.a.ref), b = entries.get(l.b.ref);
      if (!a || !b || a.unplaced || b.unplaced) continue;
      const [ax, az] = toScene(a.x, a.y), [bx, bz] = toScene(b.x, b.y);
      const dist = Math.hypot(bx - ax, bz - az);
      const apex = base + s * (0.3 + dist * 0.22);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, base, az), new THREE.Vector3((ax + bx) / 2, apex, (az + bz) / 2), new THREE.Vector3(bx, base, bz));
      const dim = state.highlightNet && !l.nets?.includes(state.highlightNet);
      const mat = dim ? linkMats.dim : l.cross ? linkMats.cross : linkMats[l.result];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, Math.round(dist * 10)), l.result === 'open' ? 0.014 : 0.026, 8), mat);
      tube.renderOrder = 4;
      linkGroup.add(tube);
      for (const [X, Z] of [[ax, az], [bx, bz]]) { const dot = new THREE.Mesh(endGeo, mat); dot.position.set(X, base, Z); dot.renderOrder = 4; linkGroup.add(dot); }
    }
    invalidate();
  }

  // ---- body highlight (hover / selection) and X-ray ghosting ----
  // Hover lifts the part with a neutral glow (its colour stays true); selection adds a gold outline shell.
  const tints = new Map();
  function tinted(base) {
    if (!tints.has(base.uuid)) {
      const m = base.clone();
      if (m.emissive) { m.emissive.set(0x2a2a2a); m.emissiveIntensity = 1; }
      tints.set(base.uuid, m);
    }
    return tints.get(base.uuid);
  }
  function paintBody(e) {
    if (!e?.group) return;
    const ghost = state.xray && e.side === state.side;
    const hov = e.key === state.hovered && e.key !== state.selected;
    e.group.traverse(m => {
      if (!m.isMesh) return;
      m.material = ghost ? xrayGhost : hov && m.userData.baseMaterial.isMeshStandardMaterial ? tinted(m.userData.baseMaterial) : m.userData.baseMaterial;
    });
  }

  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffcf6e, side: THREE.BackSide, transparent: true, opacity: 0.95, depthWrite: false });
  const _c = new THREE.Vector3(), _sz = new THREE.Vector3();
  let halo = null;
  function setHalo(e) {
    if (halo) { halo.parent?.remove(halo); halo = null; }
    if (!e?.group || e.key !== state.selected) return;
    halo = e.group.clone();
    halo.traverse(m => {
      if (!m.isMesh) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      m.geometry.boundingBox.getCenter(_c); m.geometry.boundingBox.getSize(_sz);
      const k = 1 + 0.07 / Math.max(0.04, _sz.x * Math.abs(m.scale.x), _sz.y * Math.abs(m.scale.y), _sz.z * Math.abs(m.scale.z));
      // Scale about the geometry centre so the shell stays centred on the mesh.
      m.position.add(_c.multiply(m.scale).applyQuaternion(m.quaternion).multiplyScalar(1 - k));
      m.scale.multiplyScalar(k);
      m.material = haloMat; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1;
      m.userData = {};
    });
    assembly.add(halo);
  }
  let ghosted = false;
  function applyGhost() {
    ghosted = state.xray;
    for (const e of entries.values()) if (e.group) {
      paintBody(e);
      const ghost = state.xray && e.side === state.side;
      e.group.traverse(m => { if (m.isMesh) m.castShadow = ghost ? false : m.userData.baseShadow; });
    }
    renderer.shadowMap.needsUpdate = true;
  }
  function applyXray() {
    uniforms.xrayAmount.value = state.xray ? state.xrayAmount : 0;
    if (!state.lens || !state.xray) uniforms.xrayLens.value.z = 0;
    else if (uniforms.xrayLens.value.z === 0) {
      // Start the lens where the user is looking: the selected part, else the board point at the screen centre.
      const e = entries.get(state.selected);
      const r = renderer.domElement.getBoundingClientRect();
      const hit = e && !e.unplaced ? { x: e.x, y: e.y } : pick(r.left + r.width / 2, r.top + r.height / 2);
      setLens(hit?.x ?? SIZE.w / 2, hit?.y ?? SIZE.h / 2);
    }
    applyGhost();
    invalidate();
  }

  // ---- camera ----
  const sph = new THREE.Spherical();
  let camTween = null, flipTween = null;

  // Screen space taken by the floating toolbars; the board is fitted to what is left.
  const SAFE = { top: 62, bottom: 72, side: 16 };
  // Points that must stay in frame: the board corners on both faces and the box corners of every modelled body.
  const fitPoints = [];
  function collectFitPoints() {
    fitPoints.length = 0;
    const corners = [[0, 0], [SIZE.w, 0], [SIZE.w, SIZE.mainH], [SIZE.tabW, SIZE.mainH], [SIZE.tabW, SIZE.h], [0, SIZE.h]];
    for (const [x, y] of corners) { const [X, Z] = toScene(x, y); fitPoints.push(new THREE.Vector3(X, T / 2, Z), new THREE.Vector3(X, -T / 2, Z)); }
    assembly.updateMatrixWorld(true);
    const inv = assembly.matrixWorld.clone().invert();
    for (const e of entries.values()) {
      if (!e.group) continue;
      box.setFromObject(e.group).applyMatrix4(inv);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) fitPoints.push(new THREE.Vector3(x, y, z));
    }
  }

  const _back = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Vector3(), WORLD_UP = new THREE.Vector3(0, 1, 0);
  /** Camera target and distance that frame the whole board (as seen from `side`) inside the free screen area. */
  function fit(view, side = state.side) {
    const v = VIEWS[view];
    const ph = Math.max(1, host.clientHeight), pw = Math.max(1, host.clientWidth);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tv = tanV * Math.max(0.3, (ph - SAFE.top - SAFE.bottom - inset.ty) / ph);
    const th = tanV * camera.aspect * Math.max(0.4, (pw - 2 * SAFE.side - inset.tx) / pw);
    _back.setFromSphericalCoords(1, v.phi, v.theta);
    _right.crossVectors(WORLD_UP, _back).normalize();
    _up.crossVectors(_back, _right).normalize();
    const mirror = side === 'bottom' ? -1 : 1;   // the solder side is the assembly turned about Z
    const target = new THREE.Vector3(0, v.lift, 0);
    let distance = 10;
    for (let pass = 0; pass < 3; pass++) {
      let d = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of fitPoints) {
        _q.set(p.x * mirror, p.y * mirror, p.z).sub(target);
        const qx = _q.dot(_right), qy = _q.dot(_up), qz = _q.dot(_back);
        d = Math.max(d, Math.abs(qx) / th + qz, Math.abs(qy) / tv + qz);
      }
      distance = d * 1.03;
      for (const p of fitPoints) {
        _q.set(p.x * mirror, p.y * mirror, p.z).sub(target);
        const z = distance - _q.dot(_back), sx = _q.dot(_right) / z, sy = _q.dot(_up) / z;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      // Re-centre on the projected bounds, then refit.
      target.addScaledVector(_right, ((x0 + x1) / 2) * distance).addScaledVector(_up, ((y0 + y1) / 2) * distance);
    }
    return { target, distance };
  }

  function viewPose(view, side = state.side) {
    const v = VIEWS[view];
    const { target, distance } = fit(view, side);
    const pos = new THREE.Vector3().setFromSphericalCoords(distance, v.phi, v.theta).add(target);
    return { pos, target };
  }

  function tweenTo(pos, target, ms = 850) {
    if (reducedMotion()) ms = 0;
    camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms };
    invalidate();
  }

  function stepCamera(now) {
    if (!camTween) return false;
    const k = camTween.ms ? Math.min(1, (now - camTween.start) / camTween.ms) : 1;
    const e = ease(k);
    const tgt = new THREE.Vector3().lerpVectors(camTween.t0, camTween.t1, e);
    const a = new THREE.Spherical().setFromVector3(camTween.p0.clone().sub(camTween.t0));
    const b = new THREE.Spherical().setFromVector3(camTween.p1.clone().sub(camTween.t1));
    let dTheta = b.theta - a.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2; else if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    sph.set(THREE.MathUtils.lerp(a.radius, b.radius, e), THREE.MathUtils.lerp(a.phi, b.phi, e), a.theta + dTheta * e);
    camera.position.setFromSpherical(sph).add(tgt);
    controls.target.copy(tgt);
    camera.lookAt(tgt);
    if (k >= 1) { camTween = null; controls.update(); return false; }
    return true;
  }

  // Screen insets (bottom sheet or layer cards): shift the projection centre so the board sits in the free area.
  const inset = { x: 0, y: 0, tx: 0, ty: 0 };
  const insetReq = { x: 0 };   // side inset for desktop cards; only applied while the camera is auto-framed
  function applyInset() {
    const w = host.clientWidth, h = host.clientHeight;
    if (Math.abs(inset.x) < 0.5 && Math.abs(inset.y) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(w, h, inset.x / 2, inset.y / 2, w, h);
  }
  function stepInset() {
    if (inset.x === inset.tx && inset.y === inset.ty) return false;
    inset.x += (inset.tx - inset.x) * 0.28;
    inset.y += (inset.ty - inset.y) * 0.28;
    if (Math.abs(inset.tx - inset.x) < 0.5) inset.x = inset.tx;
    if (Math.abs(inset.ty - inset.y) < 0.5) inset.y = inset.ty;
    applyInset();
    return inset.x !== inset.tx || inset.y !== inset.ty;
  }

  function setView(view, animate = true) {
    state.view = view;
    state.userMoved = false;
    inset.tx = insetReq.x;
    const { pos, target } = viewPose(view);
    if (animate) tweenTo(pos, target);
    else { camera.position.copy(pos); controls.target.copy(target); controls.update(); invalidate(); }
  }

  function focus(key) {
    const e = entries.get(key);
    if (!e || e.unplaced) return;
    const [X, Z] = toScene(e.x, e.y);
    // Aim at the settled pose: the viewed face is always up, and the solder side is mirrored in X.
    const target = new THREE.Vector3(state.side === 'top' ? X : -X, T / 2 + e.height * 0.45, Z);
    const cur = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    // Frame the part with room around it: about 2.4 footprints of context, never closer than a thumbnail of its neighbours.
    const diam = 2 * Math.max(e.he[0], e.he[1]) * K;
    const radius = THREE.MathUtils.clamp(5.2 * diam + 2.6 + e.height * 1.2, 5, 22);
    const phi = THREE.MathUtils.clamp(cur.phi, 0.0001, THREE.MathUtils.degToRad(58));
    const pos = new THREE.Vector3().setFromSphericalCoords(radius, phi, cur.theta).add(target);
    state.userMoved = true;
    tweenTo(pos, target, 750);
  }

  function clampTarget() {
    const t = controls.target;
    t.x = THREE.MathUtils.clamp(t.x, -7, 7); t.z = THREE.MathUtils.clamp(t.z, -8.5, 8.5); t.y = THREE.MathUtils.clamp(t.y, -1.5, 2.5);
  }

  // ---- flip ----
  function floorFor(theta) {
    const s = Math.sin(theta), c = Math.cos(theta);
    let min = Infinity;
    for (let i = 0; i < lowPoints.length; i += 4) {
      for (const x of [lowPoints[i], lowPoints[i + 1]]) for (const y of [lowPoints[i + 2], lowPoints[i + 3]]) {
        const wy = x * s + y * c; if (wy < min) min = wy;
      }
    }
    return min - 0.004;
  }

  function setSide(side, animate = true) {
    if (side === state.side && !flipTween) return;
    state.side = side;
    const to = side === 'top' ? 0 : Math.PI;
    if (!animate || reducedMotion()) {
      assembly.rotation.z = to; floor.position.y = floorFor(to); flipTween = null; state.flipping = false;
      finishFlip();
      return;
    }
    // Land on the fitted view of the other face (or, after the user has moved, the mirrored spot), and dolly
    // out while the board turns so its edge and the tall parts stay in frame.
    const t0 = (camTween ? camTween.t1 : controls.target).clone(), p0 = (camTween ? camTween.p1 : camera.position).clone();
    let t1, p1;
    if (!state.userMoved) ({ target: t1, pos: p1 } = viewPose(state.view, side));
    else { t1 = t0.clone(); t1.x = -t0.x; p1 = t1.clone().add(p0.clone().sub(t0)); }
    flipTween = { from: assembly.rotation.z, to, start: performance.now(), ms: 1100, t0, t1, o0: p0.sub(t0), o1: p1.sub(t1) };
    camTween = null;
    controls.enabled = false;
    state.flipping = true;
    hovRing.visible = false;
    syncLabels();
    invalidate();
  }

  function finishFlip() {
    if (state.xray || ghosted) applyGhost();
    syncLabels();
    drawLinks();
    if (state.selected) outlineFor(selRing, entries.get(state.selected), 0.035);
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  function stepFlip(now) {
    if (!flipTween) return false;
    const k = debug.flipHold ?? Math.min(1, (now - flipTween.start) / flipTween.ms);
    assembly.rotation.z = THREE.MathUtils.lerp(flipTween.from, flipTween.to, ease(k));
    floor.position.y = floorFor(assembly.rotation.z);
    if (!camTween) {
      const e = ease(k), bump = Math.sin(Math.PI * k);
      controls.target.lerpVectors(flipTween.t0, flipTween.t1, e);
      controls.target.y += 1.4 * bump;
      camera.position.copy(controls.target).add(_q.lerpVectors(flipTween.o0, flipTween.o1, e).multiplyScalar(1 + 0.55 * bump));
      camera.lookAt(controls.target);
    }
    renderer.shadowMap.needsUpdate = true;
    if (k >= 1) { flipTween = null; state.flipping = false; controls.enabled = true; controls.update(); finishFlip(); return false; }
    return debug.flipHold === undefined;
  }

  // ---- render loop ----
  let frameQueued = false, lastFrame = 0;
  const perf = { intervals: [], cpu: [] };
  const debug = { camera, controls };
  function invalidate() { if (!frameQueued) { frameQueued = true; requestAnimationFrame(frame); } }
  function frame(now) {
    frameQueued = false;
    const t0 = performance.now();
    let more = stepFlip(now);
    if (stepInset()) more = true;
    if (stepCamera(now)) more = true;
    else if (controls.update()) more = true;
    renderer.render(scene, camera);
    if (renderer.shadowMap.needsUpdate) renderer.shadowMap.needsUpdate = false;
    labelRenderer.render(scene, camera);
    declutter();
    if (debug.syncGpu) renderer.getContext().finish(); // measurement only: include GPU time in the frame cost
    const cpu = performance.now() - t0;
    perf.cpu.push(cpu);
    if (debug.trace) debug.trace.push([Math.round(now), Math.round(cpu * 10) / 10, state.flipping ? 1 : 0]);
    if (lastFrame && now - lastFrame < 250) perf.intervals.push(now - lastFrame);
    if (perf.cpu.length > 4000) perf.cpu.shift();
    if (perf.intervals.length > 4000) perf.intervals.shift();
    lastFrame = more ? now : 0;
    if (more) invalidate();
  }
  controls.addEventListener('change', () => { clampTarget(); invalidate(); });
  controls.addEventListener('start', () => { state.userMoved = true; camTween = null; });

  // ---- picking ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -T / 2);
  const hitPoint = new THREE.Vector3();

  function unitsPerPixel(worldPoint) {
    const d = camera.position.distanceTo(worldPoint);
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, host.clientHeight) / K;
  }

  /** Resolve a screen point to { key, x, y } (board units, current face); key is null over bare board. */
  function pick(clientX, clientY, coarse = false) {
    if (state.flipping) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(bodyMeshes[state.side], false);
    let bodyKey = hits.length ? hits[0].object.userData.partKey : null;
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return bodyKey ? { key: bodyKey, x: null, y: null, onBoard: false } : null;
    const local = assembly.worldToLocal(hitPoint.clone());
    const [x, y] = toBoard(local.x, local.z);
    const inside = onBoard(x, y, BOARD);
    if (bodyKey) {
      const e = entries.get(bodyKey);
      if (e.hotspot < 0 && e.height > 0.4) return { key: bodyKey, x, y, onBoard: inside };
    }
    const tol = Math.max(5, unitsPerPixel(hitPoint) * (coarse ? 16 : 9));
    let best = null, bestScore = Infinity;
    for (const e of entries.values()) {
      if (e.side !== state.side || e.unplaced) continue;
      const dx = Math.max(0, Math.abs(x - e.x) - e.he[0]), dy = Math.max(0, Math.abs(y - e.y) - e.he[1]);
      const edge = Math.hypot(dx, dy);
      if (edge > tol) continue;
      const score = edge + 0.35 * Math.hypot(x - e.x, y - e.y) / Math.max(1, Math.sqrt(e.he[0] * e.he[1]) / 10);
      if (score < bestScore) { bestScore = score; best = e.key; }
    }
    return { key: best || bodyKey, x, y, onBoard: inside };
  }

  /** Place the X-ray lens; its radius is about 60 screen pixels, so it reads the same on a phone and a desktop. */
  function setLens(x, y) {
    const [X, Z] = toScene(x, y);
    const world = assembly.localToWorld(hitPoint.set(X, (state.side === 'top' ? 1 : -1) * T / 2, Z));
    uniforms.xrayLens.value.set(x, y, THREE.MathUtils.clamp(unitsPerPixel(world) * 60, 60, 240));
    invalidate();
  }

  let down = null, hoverQueued = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
  el.addEventListener('pointerup', e => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved > (e.pointerType === 'touch' ? 10 : 5) || !quick) return;
    const hit = pick(e.clientX, e.clientY, e.pointerType !== 'mouse');
    if (state.xray && state.lens && hit?.onBoard) setLens(hit.x, hit.y);
    onTap?.(hit, e);
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const first = !hoverQueued;
    hoverQueued = { x: e.clientX, y: e.clientY };
    if (first) requestAnimationFrame(() => {
      const { x, y } = hoverQueued; hoverQueued = null;
      const hit = pick(x, y);
      if (state.xray && state.lens) {
        if (hit?.x != null) setLens(hit.x, hit.y); else { uniforms.xrayLens.value.x = uniforms.xrayLens.value.y = -999; invalidate(); }
      }
      setHover(hit?.key || null);
      el.style.cursor = debug.cursor || (hit?.key ? 'pointer' : 'grab');
    });
  });
  el.addEventListener('pointerleave', () => { setHover(null); if (state.xray && state.lens) { uniforms.xrayLens.value.x = -999; invalidate(); } });

  function setHover(key, fromLabel = false) {
    if (key === state.hovered) return;
    const prev = entries.get(state.hovered);
    state.hovered = key;
    if (prev) { writeHotspot(prev); paintBody(prev); }
    const e = entries.get(key);
    if (e) { writeHotspot(e); paintBody(e); }
    if (e && key !== state.selected) outlineFor(hovRing, e, 0.022); else hovRing.visible = false;
    syncLabels();
    onHover?.(key, fromLabel);
  }

  // ---- resize ----
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    controls.maxDistance = Math.max(42, fit('three').distance * 1.6, fit('plan').distance * 1.4);
    applyInset();
    if (!state.userMoved && !camTween) setView(state.view, false);
    invalidate();
  }
  new ResizeObserver(resize).observe(host);

  // ---- public API ----
  const api = {
    toScene,
    entries,
    load(partsList, confOf, keyParts) {
      state.keyParts = keyParts;
      for (const p of partsList) addEntry(p, confOf(p.id));
      rebuildHotspots();
      floor.position.y = floorFor(assembly.rotation.z);
      collectFitPoints();
      renderer.shadowMap.needsUpdate = true;
      renderer.compile(scene, camera);
      resize();
      setView('three', false);
      syncLabels();
    },
    addUnplaced(p) { entries.set(p.id, { key: p.id, p, side: p.side, x: 0, y: 0, he: [10, 10], group: null, height: 0.02, hotspot: -1, label: null, conf: 'unknown', unplaced: true, custom: !!p.custom }); },
    addCustom(p, conf) { const e = addEntry({ ...p, kind: 'smd-custom', w: 24, d: 24, custom: true }, conf); rebuildHotspots(); syncLabels(); return e; },
    removeEntry(key) {
      const e = entries.get(key); if (!e) return;
      if (e.label) { assembly.remove(e.label); activeLabels.delete(key); labelEls.delete(key); }
      if (e.group) assembly.remove(e.group);
      entries.delete(key);
      if (state.selected === key) api.select(null);
      rebuildHotspots(); drawLinks(); syncLabels();
    },
    move(key, x, y) {
      const e = entries.get(key); if (!e) return;
      e.x = x; e.y = y; e.unplaced = false;
      if (e.group) { placeGroup(e); if (key === state.selected) setHalo(e); renderer.shadowMap.needsUpdate = true; }
      rebuildHotspots(); positionLabel(e); drawLinks();
      if (state.selected === key) outlineFor(selRing, e, 0.035);
      syncLabels();
    },
    setConfidence(key, conf) { const e = entries.get(key); if (!e) return; e.conf = conf; writeHotspot(e); syncLabels(); invalidate(); },
    select(key, { fly = false } = {}) {
      const prev = entries.get(state.selected);
      state.selected = key;
      if (prev) { writeHotspot(prev); paintBody(prev); }
      const e = entries.get(key);
      if (e) { writeHotspot(e); paintBody(e); }
      setHalo(e);
      outlineFor(selRing, e, 0.035);
      if (key === state.hovered) hovRing.visible = false;
      syncLabels();
      if (e && fly && !e.unplaced) focus(key);
      invalidate();
    },
    focus,
    setSide,
    get side() { return state.side; },
    get flipping() { return state.flipping; },
    setView,
    get view() { return state.view; },
    setAllLabels(on) { state.allLabels = on; syncLabels(); },
    setPinned(keys) { state.pinned = keys; syncLabels(); },
    setPhotoSurface(on) { photo.on = on; applySurface(); },
    setXray(opts) { Object.assign(state, opts); applyXray(); },
    lensTo(key) { const e = entries.get(key); if (!e || e.unplaced || !state.xray || !state.lens) return; setLens(e.x, e.y); },
    setZones(on) { state.zones = on; uniforms.zoneOn.value = on ? 1 : 0; syncLabels(); invalidate(); },
    setLinks(on, links, highlightNet) { state.links = on; state.highlightNet = highlightNet || null; drawLinks(links); },
    setCursor(c) { debug.cursor = c; el.style.cursor = c || 'grab'; },
    setInset(bottom, right = 0) {
      const ty = Math.max(0, Math.round(bottom));
      insetReq.x = Math.max(0, Math.round(right));
      // The bottom sheet always lifts the view; a side card only re-frames a view the user has not moved.
      const tx = state.userMoved ? inset.tx : insetReq.x;
      if (ty === inset.ty && tx === inset.tx) return;
      inset.ty = ty; inset.tx = tx;
      if (!state.userMoved && !flipTween) setView(state.view, true);   // refit into the space that is left
      invalidate();
    },
    hover(key) { const e = entries.get(key); setHover(e && !e.unplaced && e.side === state.side ? key : null); },
    photoImage(face) { return photo.on && photo[face] ? photo[face].image : null; },
    /** Client coordinates of a board point on the viewed face (used by scripts/verify.mjs). */
    project(x, y, lift = 0) {
      const [X, Z] = toScene(x, y);
      const s = state.side === 'top' ? 1 : -1;
      const v = assembly.localToWorld(new THREE.Vector3(X, s * (T / 2 + lift), Z)).project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    },
    screenOf(key) { const e = entries.get(key); return e && !e.unplaced ? api.project(e.x, e.y, e.height * 0.6) : null; },
    invalidate,
    perf: {
      reset() { perf.intervals.length = 0; perf.cpu.length = 0; },
      read() {
        const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
        const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
        const r = v => Math.round(v * 100) / 100;
        return {
          frames: perf.cpu.length, frameCostAvgMs: r(avg(perf.cpu)), frameCostP95Ms: r(pct(perf.cpu, 0.95)), frameCostMaxMs: r(Math.max(0, ...perf.cpu)),
          intervalAvgMs: r(avg(perf.intervals)), intervalP95Ms: r(pct(perf.intervals, 0.95)), framesOver16ms: perf.cpu.filter(v => v > 16.7).length
        };
      },
      gpu() {
        const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      },
      info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; }
    },
    debug,
    /** Measurement hooks for scripts/verify.mjs and profiling (not part of the UI). */
    tune(opts) {
      if ('shadows' in opts) { renderer.shadowMap.enabled = opts.shadows; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); renderer.shadowMap.needsUpdate = true; }
      if ('pixelRatio' in opts) { renderer.setPixelRatio(opts.pixelRatio); resize(); }
      if ('shadowType' in opts) { renderer.shadowMap.type = THREE[opts.shadowType]; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); renderer.shadowMap.needsUpdate = true; }
      if ('labels' in opts) labelRenderer.domElement.style.display = opts.labels ? '' : 'none';
      invalidate();
    },
    renderer
  };
  return api;
}

