import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import layersIcon from 'lucide-static/icons/layers.svg?raw';
import imageIcon from 'lucide-static/icons/image.svg?raw';
import resetIcon from 'lucide-static/icons/rotate-ccw.svg?raw';
import searchIcon from 'lucide-static/icons/search.svg?raw';
import plusIcon from 'lucide-static/icons/plus.svg?raw';
import closeIcon from 'lucide-static/icons/x.svg?raw';
import downloadIcon from 'lucide-static/icons/download.svg?raw';
import uploadIcon from 'lucide-static/icons/upload.svg?raw';
import leftIcon from 'lucide-static/icons/chevron-left.svg?raw';
import rightIcon from 'lucide-static/icons/chevron-right.svg?raw';
import listIcon from 'lucide-static/icons/list.svg?raw';
import moveIcon from 'lucide-static/icons/move.svg?raw';
import { components as seedComponents, photos } from './board-data.js';
import './style.css';

const STORAGE_KEY = 'milwaukee-48-59-1812-board-atlas-v1';
const COLORS = {
  pcb: 0x326f5b, edge: 0x183d37, trace: 0x9b9465, pad: 0xd9b879,
  ink: 0xd1ddcc, dark: 0x1b2526, chip: 0x22292b, metal: 0xb7bec0,
  yellow: 0xe0b443, amber: 0xb86337, blue: 0x317b9d
};

const defaultNotes = () => ({ identity: '', measurements: '', role: '', observations: '', evidence: '', confidence: 'unknown' });
const saved = readSaved();
let components = seedComponents.map(c => ({ ...c, ...(saved.components?.find(x => x.id === c.id && x.side === c.side) || {}) }));
for (const c of saved.components || []) {
  if (!components.some(x => x.id === c.id && x.side === c.side)) components.push(c);
}
let notes = saved.notes || {};
let side = 'top';
let selectedId = null;
let hoveredId = null;
let showAllLabels = false;
let showPhotoSurface = true;
let addMode = false;
let relocateMode = false;
let photoIndex = 0;
const componentMeshes = new Map();
const labelSprites = new Map();
const hitMeshes = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand"><div class="brand-mark"><span></span><span></span><span></span></div><div><strong>BOARD ATLAS</strong><small>48-59-1812 / REV 0.6</small></div></div>
    <div class="top-actions">
      <div class="segmented" role="group" aria-label="Board side"><button id="top-side" class="active" type="button">Component side</button><button id="bottom-side" type="button">Solder side</button></div>
      <button id="surface-toggle" class="icon-button active" title="Toggle photographic PCB surface" aria-label="Toggle photographic PCB surface" type="button">${layersIcon}</button>
      <button id="photo-button" class="icon-button" title="Open evidence photographs" aria-label="Open evidence photographs" type="button">${imageIcon}</button>
      <button id="reset-view" class="icon-button" title="Reset camera" aria-label="Reset camera" type="button">${resetIcon}</button>
    </div>
  </header>
  <div class="workspace">
    <aside class="index-panel" id="index-panel">
      <div class="panel-heading"><span>REFERENCE INDEX</span><span class="count" id="ref-count"></span><button id="close-index" class="close-index" type="button" aria-label="Close reference index">${closeIcon}</button></div>
      <div class="search-wrap"><span aria-hidden="true">${searchIcon}</span><input id="search" type="search" placeholder="Find a board marking" autocomplete="off" aria-label="Find a board marking" /></div>
      <div class="index-tools"><button id="add-reference" type="button">${plusIcon} Add reference</button><button id="label-toggle" type="button" title="Toggle every board marking">All labels</button></div>
      <div id="add-help" class="add-help" hidden>Click a position on the PCB, then enter its board marking.</div>
      <div class="index-scroll" id="index-list"></div>
      <div class="index-footer"><span class="status-dot"></span><span>Photo-estimated placement</span></div>
    </aside>
    <main class="scene-wrap" aria-label="Interactive three-dimensional charger board">
      <div id="scene"></div>
      <div class="scene-caption"><strong id="view-caption">COMPONENT SIDE</strong><span>Drag to orbit · Scroll to zoom · Click a marking to inspect</span></div>
      <div class="scene-scale"><span></span> NOT TO SCALE</div>
      <button id="mobile-index" class="mobile-index" type="button">${listIcon} Index</button>
    </main>
    <aside class="inspector" id="inspector">
      <div class="inspector-head"><div><span class="eyebrow">COMPONENT RECORD</span><h1 id="selected-title">Select a marking</h1></div><button id="close-inspector" class="close-inspector" type="button" aria-label="Close component record">${closeIcon}</button></div>
      <div id="empty-state" class="empty-state"><div class="empty-glyph">${plusIcon}</div><p>Choose a component in the model or reference index to record what you discover.</p><small>Fields begin empty. Nothing is identified by guesswork.</small></div>
      <form id="record-form" hidden>
        <div class="record-meta"><span id="record-side"></span><span id="record-status"></span></div>
        <button id="relocate-reference" class="relocate-button" type="button" title="Move this marker to a better position on the PCB">${moveIcon} Relocate marker</button>
        <p id="relocate-help" class="relocate-help" hidden>Click the corrected PCB position.</p>
        <label>Component / identification<input name="identity" type="text" placeholder="What is this part?" autocomplete="off" /></label>
        <label>Measurements<textarea name="measurements" rows="3" placeholder="Value, test points, units, conditions..." ></textarea></label>
        <label>Use in circuit<textarea name="role" rows="3" placeholder="What does it do here?" ></textarea></label>
        <label>Observations<textarea name="observations" rows="3" placeholder="Markings, polarity, orientation, condition..." ></textarea></label>
        <label>Evidence / source<input name="evidence" type="text" placeholder="Photo, continuity test, datasheet..." autocomplete="off" /></label>
        <label>Confidence<select name="confidence"><option value="unknown">Unknown</option><option value="probable">Probable</option><option value="confirmed">Confirmed</option></select></label>
        <div class="form-foot"><span id="save-state">Saved on this laptop</span><button id="remove-custom" type="button" hidden>Remove marker</button></div>
      </form>
      <div class="data-actions"><button id="export-notes" type="button">${downloadIcon} Export records</button><label class="import-button">${uploadIcon} Import records<input id="import-notes" type="file" accept="application/json,.json" hidden /></label></div>
      <p class="storage-note">Records save in this browser. Export them to keep with the Git project or move between computers.</p>
    </aside>
  </div>
  <dialog id="photo-dialog" class="photo-dialog"><div class="photo-head"><div><span class="eyebrow">SOURCE EVIDENCE</span><strong id="photo-title"></strong></div><button id="photo-close" class="icon-button" aria-label="Close photograph" type="button">${closeIcon}</button></div><img id="photo-image" alt="Charger PCB evidence photograph" /><div class="photo-controls"><button id="photo-prev" type="button">${leftIcon} Previous</button><span id="photo-position"></span><button id="photo-next" type="button">Next ${rightIcon}</button></div></dialog>
  <dialog id="add-dialog" class="add-dialog"><form method="dialog" id="add-form"><span class="eyebrow">NEW BOARD MARKING</span><h2>Add reference</h2><p>Use the exact designator printed on the PCB. Its position can be refined later.</p><label>Board marking<input id="new-designator" name="designator" required maxlength="16" placeholder="e.g. R58" autocomplete="off" /></label><div class="dialog-actions"><button value="cancel" type="submit">Cancel</button><button value="add" type="submit" class="primary">Add marker</button></div></form></dialog>
`;

const sceneHost = document.querySelector('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111b1b);
scene.fog = new THREE.Fog(0x111b1b, 23, 55);
const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
camera.position.set(0, 18.5, 18.3);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneHost.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 1.55);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 7;
controls.maxDistance = 43;
controls.maxPolarAngle = Math.PI * 0.84;
controls.minPolarAngle = 0.1;
controls.update();
scene.add(new THREE.HemisphereLight(0xe0f4ec, 0x284640, 2.1));
const keyLight = new THREE.DirectionalLight(0xfff3d6, 3.3);
keyLight.position.set(-5, 13, 8);
keyLight.castShadow = true;
keyLight.shadow.bias = -0.0005;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -13;
keyLight.shadow.camera.right = 13;
keyLight.shadow.camera.top = 13;
keyLight.shadow.camera.bottom = -13;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x70aeb8, 2.15);
fillLight.position.set(8, 9, -6);
scene.add(fillLight);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x182323, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.65;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(100, 60, 0x33504e, 0x243735);
grid.position.y = -1.64;
grid.material.transparent = true;
grid.material.opacity = 0.27;
scene.add(grid);

const assembly = new THREE.Group();
scene.add(assembly);
const boardShape = new THREE.Shape();
boardShape.moveTo(-5.85, -5.42);
boardShape.lineTo(5.85, -5.42);
boardShape.lineTo(5.85, 5.45);
boardShape.lineTo(2.8, 5.45);
boardShape.lineTo(2.8, 3.28);
boardShape.lineTo(-2.55, 3.28);
boardShape.lineTo(-2.55, 8.84);
boardShape.lineTo(-5.85, 8.84);
boardShape.closePath();
for (const z of [1.65, 2.1, 2.55, 3.0]) {
  const hole = new THREE.Path();
  hole.absellipse(0.25, z, 0.18, 0.18, 0, Math.PI * 2, false);
  boardShape.holes.push(hole);
}
for (const [x, z, w, d] of [[2.95, -1.43, 1.55, 0.22], [2.95, -3.66, 1.55, 0.22]]) {
  const hole = new THREE.Path();
  hole.moveTo(x - w / 2, z - d / 2);
  hole.lineTo(x + w / 2, z - d / 2);
  hole.lineTo(x + w / 2, z + d / 2);
  hole.lineTo(x - w / 2, z + d / 2);
  hole.closePath();
  boardShape.holes.push(hole);
}
const boardGeo = new THREE.ExtrudeGeometry(boardShape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.035, bevelSegments: 2, curveSegments: 18 });
boardGeo.rotateX(Math.PI / 2);
const board = new THREE.Mesh(boardGeo, [new THREE.MeshStandardMaterial({ color: COLORS.pcb, metalness: 0.12, roughness: 0.64, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: COLORS.edge, roughness: 0.7 })]);
board.position.y = 0.09;
board.castShadow = true;
board.receiveShadow = false;
board.userData.isBoard = true;
assembly.add(board);

const photoSurfaces = [];
function addPhotoSurface(url, crop, isBottom) {
  const img = new Image();
  img.src = url;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048; canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    const [x, y, w, h] = crop;
    ctx.drawImage(img, x * img.width, y * img.height, w * img.width, h * img.height, 0, 0, 2048, 2048);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const geo = new THREE.ShapeGeometry(boardShape, 18);
    geo.rotateX(Math.PI / 2);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const xCoord = (pos.getX(i) + 5.85) / 11.7;
      const zCoord = (pos.getZ(i) + 5.42) / 14.26;
      uv.setXY(i, isBottom ? 1 - xCoord : xCoord, 1 - zCoord);
    }
    uv.needsUpdate = true;
    const surface = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.64, depthWrite: false, side: THREE.DoubleSide }));
    surface.position.y = isBottom ? -0.146 : 0.146;
    surface.visible = showPhotoSurface;
    surface.renderOrder = 1;
    assembly.add(surface);
    photoSurfaces.push(surface);
  };
}
addPhotoSurface(photos[0].src, [0.153, 0.167, 0.738, 0.698], false);
addPhotoSurface(photos[1].src, [0.022, 0.074, 0.923, 0.845], true);

function material(color, metalness = 0, roughness = 0.65) { return new THREE.MeshStandardMaterial({ color, metalness, roughness }); }
const mat = {
  pad: material(COLORS.pad, 0.62, 0.36), trace: material(COLORS.trace, 0.35, 0.56),
  chip: material(COLORS.chip, 0.12, 0.72), metal: material(COLORS.metal, 0.72, 0.27),
  yellow: material(COLORS.yellow, 0.1, 0.72), amber: material(COLORS.amber, 0.06, 0.7),
  blue: material(COLORS.blue, 0.15, 0.55), white: material(0xd6d6c4, 0.06, 0.8),
  green: material(0x537f65, 0.04, 0.65), ferrite: material(0x303633, 0.06, 0.82)
};

function box(parent, w, h, d, x, y, z, m, bevel = 0) {
  const geo = bevel ? new THREE.BoxGeometry(w, h, d) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent, radius, h, x, y, z, m, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, segments), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function plane(parent, w, d, x, y, z, m) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function line(parent, points, color, radius = 0.012) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 5, false), material(color, 0.46, 0.6));
  parent.add(mesh);
  return mesh;
}
function addPads() {
  const seed = [[-5.25,-4.95],[-4.55,-4.95],[4.9,-4.95],[5.5,-4.95],[-5.15,8.18],[-4.42,8.18],[-3.65,8.18],[-2.93,8.18],[4.72,4.95],[5.39,4.95]];
  for (const [x,z] of seed) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.033, 7, 20), mat.pad);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.135, z);
    assembly.add(ring);
  }
  for (let i = 0; i < 55; i++) {
    const x = -5.35 + ((i * 3.13) % 10.7);
    const z = -4.9 + ((i * 2.31) % 9.8);
    if (x < -2.1 || z < 5.25) cylinder(assembly, 0.023, 0.007, x, 0.137, z, mat.pad, 12);
  }
  for (const [a,b] of [[[-4.8,0.1],[-2.75,0.1]], [[-4.8,1.7],[-2.75,1.7]], [[3.45,-4.3],[5.3,-4.3]], [[3.8,4.7],[5.25,4.7]], [[-4.7,6.3],[-3.3,6.3]]]) {
    line(assembly, [[a[0],0.13,a[1]],[(a[0]+b[0])/2,0.13,(a[1]+b[1])/2],[b[0],0.13,b[1]]], COLORS.trace, 0.016);
  }
  // The hatched strip marks the visible board isolation region, not a traced net.
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xc5d7b9, transparent: true, opacity: 0.61, side: THREE.DoubleSide });
  for (let z = -4.95; z < 4.95; z += 0.38) {
    const stripe = plane(assembly, 0.62, 0.018, 0.34, 0.142, z, stripeMat);
    stripe.rotation.z = -0.45;
  }
  for (const [x,z] of [[-5.4,-4.98],[5.42,-4.98],[-5.4,8.43],[-2.95,8.43]]) {
    cylinder(assembly, 0.19, 0.009, x, 0.14, z, mat.pad);
    cylinder(assembly, 0.11, 0.012, x, 0.149, z, material(0x183c35));
  }
}
addPads();

function modelComponent(c) {
  const anchor = new THREE.Group();
  const px = c.side === 'bottom' ? -c.x : c.x;
  anchor.position.set(px, c.side === 'top' ? 0.16 : -0.16, c.z);
  if (c.side === 'bottom') anchor.rotation.z = Math.PI;
  assembly.add(anchor);
  const k = c.kind;
  if (k === 'transformer') {
    box(anchor, c.w, 1.12, c.d, 0, 0.67, 0, mat.ferrite);
    box(anchor, c.w * 0.54, 1.35, c.d * 0.92, 0, 0.82, 0, mat.yellow);
    for (const s of [-1,1]) box(anchor, 0.15, 0.83, c.d * 0.85, s * c.w * 0.46, 0.72, 0, mat.amber);
    for (let i = -2; i <= 2; i++) {
      box(anchor, 0.12, 0.11, 0.5, -0.82 + i * 0.36, 0.06, -1.18, mat.metal);
      box(anchor, 0.12, 0.11, 0.5, -0.82 + i * 0.36, 0.06, 1.18, mat.metal);
    }
  } else if (k === 'electrolytic') {
    cylinder(anchor, c.w * 0.55, c.w * 1.5, 0, c.w * 0.76, 0, mat.chip);
    cylinder(anchor, c.w * 0.53, 0.035, 0, c.w * 1.54, 0, mat.metal);
    box(anchor, c.w * 0.78, 0.01, 0.026, 0, c.w * 1.565, 0, mat.chip);
    box(anchor, 0.026, 0.01, c.w * 0.78, 0, c.w * 1.57, 0, mat.chip);
  } else if (k === 'inductor') {
    box(anchor, c.w, 0.54, c.d, 0, 0.34, 0, mat.ferrite);
    for (let i = -2; i <= 2; i++) box(anchor, 0.065, 0.58, c.d + 0.05, i * c.w / 5, 0.32, 0, mat.amber);
  } else if (k === 'disc') {
    const disc = cylinder(anchor, c.w * 0.52, 0.13, 0, 0.43, 0, k === 'F1' ? mat.amber : mat.green);
    disc.rotation.z = Math.PI / 2;
    for (const s of [-1,1]) box(anchor, 0.045, 0.48, 0.045, s * c.w * 0.25, 0.23, 0, mat.metal);
  } else if (k === 'led') {
    cylinder(anchor, 0.11, 0.25, 0, 0.17, 0, material(0xc2debd, 0.1, 0.25), 20);
  } else if (k === 'removed') {
    box(anchor, c.w, 0.017, c.d, 0, 0.015, 0, material(0x1c433c));
    for (let i = -2; i <= 2; i++) box(anchor, 0.08, 0.025, 0.19, i * 0.15, 0.029, c.d * 0.55, mat.pad);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(c.w * 1.08, 0.02, c.d * 1.12)), new THREE.LineBasicMaterial({ color: 0xedc47d }));
    outline.position.y = 0.045;
    anchor.add(outline);
  } else if (k === 'film') {
    box(anchor, c.w, 0.56, c.d, 0, 0.32, 0, k === 'C1' ? mat.yellow : mat.amber);
  } else if (k === 'power') {
    box(anchor, c.w, 0.18, c.d, 0, 0.13, 0, mat.chip);
    box(anchor, c.w * 0.46, 0.04, c.d * 0.8, -c.w * 0.42, 0.04, 0, mat.metal);
    for (const z of [-0.17,0.17]) box(anchor, 0.2, 0.03, 0.08, c.w * 0.5, 0.04, z, mat.metal);
  } else if (k === 'shunt') {
    box(anchor, c.w, 0.13, c.d, 0, 0.09, 0, mat.white);
    for (const s of [-1,1]) box(anchor, 0.15, 0.145, c.d, s * c.w * 0.44, 0.09, 0, mat.metal);
  } else if (k === 'ic' || k === 'chip') {
    box(anchor, c.w, 0.18, c.d, 0, 0.14, 0, mat.chip);
    const pins = k === 'ic' ? 8 : 4;
    for (let i = 0; i < pins; i++) {
      const x = ((i + 0.5) / pins - 0.5) * c.w * 0.9;
      for (const s of [-1,1]) box(anchor, 0.028, 0.026, 0.14, x, 0.037, s * (c.d * 0.53), mat.metal);
    }
  } else {
    box(anchor, c.w, k === 'smd' ? 0.085 : 0.15, c.d, 0, k === 'smd' ? 0.068 : 0.09, 0, k === 'diode' ? mat.chip : mat.white);
    for (const s of [-1,1]) box(anchor, 0.083, 0.09, c.d, s * c.w * 0.43, 0.06, 0, mat.metal);
  }
  anchor.traverse(obj => { if (obj.isMesh) { obj.userData.componentId = c.id; hitMeshes.push(obj); } });
  componentMeshes.set(c.id, anchor);
  const label = makeLabel(c.id, c.status === 'removed');
  label.position.set(px + (c.w > 0.8 ? c.w * 0.52 : 0.32), c.side === 'top' ? 0.5 : -0.5, c.z + (c.d > 0.8 ? c.d * 0.44 : 0.1));
  assembly.add(label);
  labelSprites.set(c.id, label);
}

function makeLabel(value, ghost = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 88;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = ghost ? 'rgba(91,58,36,.9)' : 'rgba(18,35,34,.92)';
  ctx.beginPath(); ctx.roundRect(7, 9, 242, 68, 12); ctx.fill();
  ctx.strokeStyle = ghost ? '#e2aa60' : '#739b88'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = ghost ? '#ffd597' : '#f0f7e5';
  ctx.font = 'bold 39px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, 128, 44);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set(1.08, 0.37, 1);
  sprite.renderOrder = 20;
  return sprite;
}

for (const c of components) modelComponent(c);
const selectionRing = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.025, 6, 64), new THREE.MeshBasicMaterial({ color: 0xf6cf7a, transparent: true, opacity: 0.95, depthTest: false }));
selectionRing.rotation.x = Math.PI / 2;
selectionRing.visible = false;
assembly.add(selectionRing);

function updateLabelVisibility() {
  const important = new Set(['T1','U1','C1','C2','C3','L2','NTC1','F1','D4','D6','R27','U4','U5','U6','Q6','Q7','Q14','Q15']);
  for (const c of components) {
    const label = labelSprites.get(c.id);
    if (!label) continue;
    label.visible = c.side === side && (showAllLabels || important.has(c.id) || c.id === selectedId || c.id === hoveredId);
    label.material.opacity = c.id === selectedId ? 1 : (c.id === hoveredId ? 0.98 : 0.87);
  }
}

function setSide(next) {
  side = next;
  document.querySelector('#top-side').classList.toggle('active', side === 'top');
  document.querySelector('#bottom-side').classList.toggle('active', side === 'bottom');
  document.querySelector('#view-caption').textContent = side === 'top' ? 'COMPONENT SIDE' : 'SOLDER SIDE';
  assembly.rotation.z = side === 'top' ? 0 : Math.PI;
  for (const c of components) componentMeshes.get(c.id).visible = c.side === side;
  renderIndex();
  updateLabelVisibility();
  if (selectedId && components.find(c => c.id === selectedId)?.side !== side) selectComponent(null);
}

function selectComponent(id, focus = false) {
  selectedId = id;
  const c = components.find(x => x.id === id);
  const form = document.querySelector('#record-form');
  document.querySelector('#empty-state').hidden = Boolean(c);
  form.hidden = !c;
  document.querySelector('#selected-title').textContent = c?.id || 'Select a marking';
  selectionRing.visible = Boolean(c);
  if (c) {
    if (c.side !== side) setSide(c.side);
    selectionRing.position.set(c.side === 'bottom' ? -c.x : c.x, c.side === 'top' ? 0.2 : -0.2, c.z);
    selectionRing.scale.setScalar(Math.max(0.68, Math.min(1.9, Math.max(c.w,c.d) * 1.4)));
    const record = { ...defaultNotes(), ...(notes[c.id] || {}) };
    for (const [key,value] of Object.entries(record)) form.elements[key].value = value;
    document.querySelector('#record-side').textContent = c.side === 'top' ? 'Component side' : 'Solder side';
    document.querySelector('#record-status').textContent = c.status === 'removed' ? 'Removed from board' : 'Present in photos';
    document.querySelector('#remove-custom').hidden = !c.custom;
    document.querySelector('#relocate-reference').classList.toggle('active', relocateMode);
    if (focus) {
      const target = new THREE.Vector3(c.side === 'bottom' ? -c.x : c.x, 0, c.z).applyMatrix4(assembly.matrixWorld);
      controls.target.copy(target);
      camera.position.set(target.x + (side === 'top' ? 0.2 : -0.2), 9.7, target.z + 8.9);
      controls.update();
    }
  }
  updateLabelVisibility();
  renderIndex();
  document.querySelector('#inspector').classList.toggle('mobile-open', Boolean(c));
}

function renderIndex() {
  const filter = document.querySelector('#search').value.trim().toUpperCase();
  const visible = components.filter(c => c.side === side && c.id.toUpperCase().includes(filter));
  visible.sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  document.querySelector('#ref-count').textContent = `${visible.length} mapped`;
  document.querySelector('#index-list').innerHTML = visible.map(c => `<button class="ref-row ${c.id === selectedId ? 'selected' : ''}" data-id="${escapeHtml(c.id)}" type="button"><span class="ref-id">${escapeHtml(c.id)}</span><span class="ref-note">${escapeHtml(notes[c.id]?.identity || (c.status === 'removed' ? 'removed footprint' : ''))}</span><span class="ref-chevron">›</span></button>`).join('') || '<p class="no-results">No matching markings on this side.</p>';
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]); }
function readSaved() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } }
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, board: 'Milwaukee 48-59-1812 / 860323007 Rev 0.6', updated: new Date().toISOString(), components, notes }));
  document.querySelector('#save-state').textContent = 'Saved on this laptop';
}
function getBoardHit(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...hitMeshes, board], false);
  return hits.find(h => (h.object.userData.componentId && components.find(c => c.id === h.object.userData.componentId)?.side === side) || h.object.userData.isBoard);
}

let mouseDown = null;
renderer.domElement.addEventListener('pointerdown', e => { mouseDown = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!mouseDown || Math.hypot(e.clientX - mouseDown.x, e.clientY - mouseDown.y) > 5) return;
  const hit = getBoardHit(e);
  if (relocateMode && selectedId && hit?.object.userData.isBoard) {
    const c = components.find(x => x.id === selectedId);
    const localPoint = assembly.worldToLocal(hit.point.clone());
    c.x = Math.round((side === 'bottom' ? -localPoint.x : localPoint.x) * 100) / 100;
    c.z = Math.round(localPoint.z * 100) / 100;
    const anchor = componentMeshes.get(c.id);
    const px = side === 'bottom' ? -c.x : c.x;
    anchor.position.set(px, side === 'top' ? 0.16 : -0.16, c.z);
    labelSprites.get(c.id).position.set(px + (c.w > 0.8 ? c.w * 0.52 : 0.32), side === 'top' ? 0.5 : -0.5, c.z + (c.d > 0.8 ? c.d * 0.44 : 0.1));
    selectionRing.position.set(px, side === 'top' ? 0.2 : -0.2, c.z);
    relocateMode = false;
    document.querySelector('#relocate-reference').classList.remove('active');
    document.querySelector('#relocate-help').hidden = true;
    persist();
    return;
  }
  if (addMode && hit?.object.userData.isBoard) {
    const localPoint = assembly.worldToLocal(hit.point.clone());
    window.pendingPosition = { x: Math.round((side === 'bottom' ? -localPoint.x : localPoint.x) * 100) / 100, z: Math.round(localPoint.z * 100) / 100 };
    document.querySelector('#new-designator').value = '';
    document.querySelector('#add-dialog').showModal();
    document.querySelector('#new-designator').focus();
    return;
  }
  if (hit?.object.userData.componentId) selectComponent(hit.object.userData.componentId);
});
renderer.domElement.addEventListener('pointermove', e => {
  const hit = getBoardHit(e);
  const id = hit?.object.userData.componentId || null;
  if (id !== hoveredId) { hoveredId = id; updateLabelVisibility(); }
  renderer.domElement.style.cursor = addMode || relocateMode ? 'crosshair' : (id ? 'pointer' : 'grab');
});
document.querySelector('#index-list').addEventListener('click', e => {
  const row = e.target.closest('.ref-row');
  if (row) { selectComponent(row.dataset.id, true); document.querySelector('#index-panel').classList.remove('mobile-open'); }
});
document.querySelector('#search').addEventListener('input', renderIndex);
document.querySelector('#top-side').addEventListener('click', () => setSide('top'));
document.querySelector('#bottom-side').addEventListener('click', () => setSide('bottom'));
document.querySelector('#reset-view').addEventListener('click', () => {
  setDefaultCamera();
});
document.querySelector('#surface-toggle').addEventListener('click', e => {
  showPhotoSurface = !showPhotoSurface;
  e.currentTarget.classList.toggle('active', showPhotoSurface);
  for (const surface of photoSurfaces) surface.visible = showPhotoSurface;
});
document.querySelector('#label-toggle').addEventListener('click', e => { showAllLabels = !showAllLabels; e.target.classList.toggle('active', showAllLabels); updateLabelVisibility(); });
document.querySelector('#add-reference').addEventListener('click', e => {
  addMode = !addMode; e.target.classList.toggle('active', addMode); document.querySelector('#add-help').hidden = !addMode;
  if (addMode) { relocateMode = false; document.querySelector('#relocate-reference').classList.remove('active'); document.querySelector('#relocate-help').hidden = true; }
});
document.querySelector('#relocate-reference').addEventListener('click', e => {
  if (!selectedId) return;
  relocateMode = !relocateMode;
  e.currentTarget.classList.toggle('active', relocateMode);
  document.querySelector('#relocate-help').hidden = !relocateMode;
  if (relocateMode) {
    addMode = false; document.querySelector('#add-reference').classList.remove('active'); document.querySelector('#add-help').hidden = true;
    document.querySelector('#inspector').classList.remove('mobile-open');
  }
});
document.querySelector('#add-form').addEventListener('submit', e => {
  if (e.submitter?.value !== 'add') return;
  e.preventDefault();
  const id = document.querySelector('#new-designator').value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{0,15}$/.test(id)) { document.querySelector('#new-designator').setCustomValidity('Use a board marking such as R58 or NTC2.'); document.querySelector('#new-designator').reportValidity(); return; }
  if (components.some(c => c.id === id)) { document.querySelector('#new-designator').setCustomValidity('That marking is already mapped.'); document.querySelector('#new-designator').reportValidity(); return; }
  const c = { id, side, kind: 'smd', x: window.pendingPosition.x, z: window.pendingPosition.z, w: 0.35, d: 0.22, custom: true };
  components.push(c); modelComponent(c); persist(); renderIndex(); selectComponent(id);
  addMode = false; document.querySelector('#add-reference').classList.remove('active'); document.querySelector('#add-help').hidden = true;
  document.querySelector('#add-dialog').close();
});
document.querySelector('#new-designator').addEventListener('input', e => e.target.setCustomValidity(''));
document.querySelector('#record-form').addEventListener('input', e => {
  if (!selectedId || !e.target.name) return;
  notes[selectedId] = { ...defaultNotes(), ...(notes[selectedId] || {}), [e.target.name]: e.target.value };
  persist(); renderIndex();
});
document.querySelector('#remove-custom').addEventListener('click', () => {
  const c = components.find(x => x.id === selectedId);
  if (!c?.custom || !confirm(`Remove ${c.id} from the model and delete its record?`)) return;
  components = components.filter(x => x !== c); delete notes[c.id];
  const group = componentMeshes.get(c.id); const label = labelSprites.get(c.id);
  if (group) { group.traverse(o => { const idx = hitMeshes.indexOf(o); if (idx >= 0) hitMeshes.splice(idx, 1); }); assembly.remove(group); }
  if (label) assembly.remove(label);
  componentMeshes.delete(c.id); labelSprites.delete(c.id); selectComponent(null); persist(); renderIndex();
});
document.querySelector('#export-notes').addEventListener('click', () => {
  const payload = { schema: 1, board: 'Milwaukee 48-59-1812 / 860323007 Rev 0.6', exported: new Date().toISOString(), components, notes };
  const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `48-59-1812-board-records-${new Date().toISOString().slice(0,10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 3000);
});
document.querySelector('#import-notes').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.schema !== 1 || !Array.isArray(payload.components) || !payload.notes || typeof payload.notes !== 'object') throw new Error('Not a Board Atlas export.');
    if (!confirm('Import will replace the records currently saved in this browser. Continue?')) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); location.reload();
  } catch (err) { alert(`Import failed: ${err.message}`); }
  e.target.value = '';
});
document.querySelector('#mobile-index').addEventListener('click', () => document.querySelector('#index-panel').classList.toggle('mobile-open'));
document.querySelector('#close-index').addEventListener('click', () => document.querySelector('#index-panel').classList.remove('mobile-open'));
document.querySelector('#close-inspector').addEventListener('click', () => document.querySelector('#inspector').classList.remove('mobile-open'));

function updatePhoto() {
  const photo = photos[photoIndex];
  document.querySelector('#photo-title').textContent = photo.label;
  document.querySelector('#photo-image').src = photo.src;
  document.querySelector('#photo-position').textContent = `${photoIndex + 1} / ${photos.length}`;
}
document.querySelector('#photo-button').addEventListener('click', () => { updatePhoto(); document.querySelector('#photo-dialog').showModal(); });
document.querySelector('#photo-close').addEventListener('click', () => document.querySelector('#photo-dialog').close());
document.querySelector('#photo-prev').addEventListener('click', () => { photoIndex = (photoIndex + photos.length - 1) % photos.length; updatePhoto(); });
document.querySelector('#photo-next').addEventListener('click', () => { photoIndex = (photoIndex + 1) % photos.length; updatePhoto(); });

function resize() {
  const w = sceneHost.clientWidth, h = sceneHost.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (!selectedId) setDefaultCamera();
}
function setDefaultCamera() {
  const aspect = sceneHost.clientWidth / Math.max(sceneHost.clientHeight, 1);
  const distance = Math.max(18.5, 8.9 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), 6.9 / (Math.max(aspect, 0.1) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
  camera.position.set(0, distance * 0.93, distance * 0.37 + 1.6);
  controls.target.set(0, 0, 1.7);
  controls.update();
}
new ResizeObserver(resize).observe(sceneHost);
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
setSide('top');
resize();
animate();
