// Stylised 3D stand-ins for the parts on the board. Shapes follow the photographs; heights are estimates.
// Every builder returns a Group whose origin is the part's base point on the board surface, +Y up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const K = 0.01;
const u = v => v * K;

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Sleeve with the polarity stripe only. Printed values are deliberately left off: the ratings are not read yet.
function sleeveTexture(base, band) {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = base; c.fillRect(0, 0, s, s);
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    c.fillStyle = band; c.fillRect(s * 0.02, 0, s * 0.2, s);
    c.fillStyle = 'rgba(0,0,0,.35)';
    for (let y = s * 0.12; y < s * 0.9; y += s * 0.13) c.fillRect(s * 0.06, y, s * 0.12, s * 0.045);
  });
}

function capTopTexture() {
  return canvasTexture(256, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#e9ecec'); g.addColorStop(0.7, '#b4bbbd'); g.addColorStop(1, '#8b9396');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(40,44,46,.75)'; c.lineWidth = s * 0.012;
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2); c.stroke();
    c.lineWidth = s * 0.02;
    c.beginPath(); c.moveTo(s * 0.22, s / 2); c.lineTo(s * 0.78, s / 2); c.moveTo(s / 2, s * 0.22); c.lineTo(s / 2, s * 0.78); c.stroke();
  });
}

function labelTexture(text, bg, fg) {
  return canvasTexture(128, (c, s) => {
    c.fillStyle = bg; c.fillRect(0, 0, s, s); c.fillStyle = fg;
    c.font = `bold ${s * 0.3}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, s / 2, s / 2);
  });
}

const std = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const M = {
  ferrite: std(0x2b2d2f, 0.5, 0.15), plastic: std(0x151617, 0.42, 0.05), epoxy: std(0x1a1b1d, 0.55, 0.05),
  tapeYellow: std(0xe3d46a, 0.62), tapeAmber: std(0x9c6a2c, 0.6), tapeOlive: std(0xa9a24a, 0.6), coil: std(0xb87333, 0.35, 0.7),
  aluminium: std(0xc9ced2, 0.3, 0.9, { envMapIntensity: 1.6 }), tin: std(0xc2c5c7, 0.28, 0.9), gold: std(0xd7b25f, 0.3, 0.85),
  filmYellow: std(0xd9a41c, 0.38), brown: std(0x714a44, 0.5), filmBrown: std(0x86402f, 0.5), gray: std(0x8b8f9b, 0.55),
  teal: std(0x4f8d7a, 0.4), amber: std(0xdba22e, 0.4), blueDisc: std(0x2f7fc9, 0.32, 0.02), orange: std(0xd08d34, 0.5), blueBody: std(0x7d95a0, 0.5),
  black: std(0x18191a, 0.5), ghost: new THREE.MeshStandardMaterial({ color: 0xe6b563, transparent: true, opacity: 0.16, roughness: 0.6, depthWrite: false }),
  led: new THREE.MeshPhysicalMaterial({ color: 0xeaf3dc, roughness: 0.14, transparent: true, opacity: 0.8, clearcoat: 1 }),
  white: std(0xd8d4c6, 0.6), rubber: std(0x0e0f10, 0.8), ring: std(0xd7b25f, 0.3, 0.85), dark: std(0x101112, 0.9)
};
const shared = new Map();
/** One material per distinct look, created on first use and shared by every part. */
const cached = (key, make) => { if (!shared.has(key)) shared.set(key, make()); return shared.get(key); };
let sleeves;
const sleeveMat = kind => {
  sleeves ||= {
    black: std(0xffffff, 0.45, 0.1, { map: sleeveTexture('#141617', '#9ea6a8') }),
    green: std(0xffffff, 0.45, 0.1, { map: sleeveTexture('#2b6a58', '#c6d2c9') })
  };
  return sleeves[kind] || sleeves.black;
};

// Brushed-metal streaks for the aluminium bracket (roughness + slight tone variation).
function brushedTexture() {
  return canvasTexture(256, (c, s) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.fillStyle = '#d4d8db'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const y = rnd() * s, a = 0.03 + rnd() * 0.07;
      c.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(60,66,70,${a})`;
      c.fillRect(0, y, s, 0.6 + rnd() * 1.2);
    }
  });
}
M.aluminium.map = brushedTexture();
M.aluminium.color.set(0xffffff);

const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

function lathe(r, h, shoulder = 0.18) {
  const s = Math.min(r * shoulder * 2, h * 0.4);
  const pts = [[0, 0], [r, 0], [r, h - s]];
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push([r - s + Math.cos(a) * s, h - s + Math.sin(a) * s]); }
  pts.push([0, h]);
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 40);
}

function wire(parent, points, radius = 0.026, material = M.tin) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  return mesh(parent, new THREE.TubeGeometry(curve, Math.max(10, points.length * 8), radius, 8), material);
}

function leads(g, xs, top, radius = 0.024) {
  for (const x of xs) mesh(g, new THREE.CylinderGeometry(radius, radius, top, 8), M.tin, x[0], top / 2, x[1] ?? 0);
}

const builders = {
  xfmr(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d), h = u(p.h);
    // Top view in 1-Photo-1.jpg: an oval taped winding, the two ferrite core halves either side, a yellow tape band across the middle.
    const winding = mesh(g, lathe(0.5, 1, 0.3), M.tapeAmber, 0, 0, 0);
    winding.scale.set(w * 0.98, h * 0.64, d * 0.9);
    for (const s of [-1, 1]) {
      mesh(g, rbox(w * 0.2, h * 0.84, d * 0.64, 0.035), M.ferrite, s * w * 0.27, h * 0.42, 0);
      mesh(g, rbox(w * 0.06, h * 0.5, d * 0.4, 0.02), M.coil, s * w * 0.39, h * 0.52, 0);
    }
    mesh(g, rbox(w * 0.36, h, d * 0.96, 0.05), M.tapeYellow, 0, h * 0.5, 0);
    return g;
  },

  bracket(p) {
    const g = new THREE.Group(); const t = u(p.t), lean = u(p.lean), h = u(p.h), len = u(p.y1 - p.y0);
    const section = new THREE.Shape(); section.moveTo(0, 0); section.lineTo(t, 0); section.lineTo(t + lean, h); section.lineTo(lean, h); section.closePath();
    mesh(g, new THREE.ExtrudeGeometry(section, { depth: len, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }), M.aluminium);
    const rim = mesh(g, new THREE.CylinderGeometry(0.03, 0.03, len, 12), M.aluminium, lean + t * 0.5, h, len / 2);
    rim.rotation.x = Math.PI / 2;
    mesh(g, rbox(u(p.foot_x1 - p.x), t, u(p.foot_y1 - p.foot_y0), 0.01), M.aluminium, u(p.foot_x1 - p.x) / 2, t / 2, u(p.foot_y0 - p.y0) + u(p.foot_y1 - p.foot_y0) / 2);
    return g;
  },

  elcap(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2, h = u(p.h);
    mesh(g, new THREE.CylinderGeometry(r, r, h * 0.05, 40), M.rubber, 0, h * 0.025, 0);
    const sleeve = mesh(g, new THREE.CylinderGeometry(r * 0.985, r * 0.985, h * 0.92, 48, 1, true), sleeveMat(p.sleeve), 0, h * 0.51, 0);
    sleeve.rotation.y = 0.5 + (p.x % 7) * 0.3;
    const ring = mesh(g, new THREE.TorusGeometry(r * 0.93, r * 0.05, 10, 48), M.aluminium, 0, h * 0.965, 0); ring.rotation.x = Math.PI / 2;
    const top = mesh(g, new THREE.CircleGeometry(r * 0.93, 48), cached('capTop', () => std(0xffffff, 0.38, 0.75, { map: capTopTexture() })), 0, h * 0.968, 0);
    top.rotation.x = -Math.PI / 2; top.rotation.z = (p.y % 5) * 0.3;
    top.castShadow = false;
    return g;
  },

  block(p) {
    const g = new THREE.Group();
    mesh(g, rbox(u(p.w), u(p.h), u(p.d), 0.05), M.plastic, 0, u(p.h) / 2, 0);
    mesh(g, rbox(u(p.w) * 0.97, u(p.h) * 0.12, u(p.d) * 0.97, 0.02), M.ferrite, 0, u(p.h) * 0.06, 0);
    return g;
  },

  choke(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d), h = u(p.h);
    mesh(g, rbox(w * 0.9, h * 0.72, d * 0.44, 0.04), M.ferrite, 0, h * 0.36, 0);
    for (const s of [-1, 1]) mesh(g, rbox(w * 0.22, h * 0.98, d * 0.96, 0.05), s < 0 ? M.tapeOlive : M.tapeYellow, s * w * 0.27, h * 0.49, 0);
    return g;
  },

  film(p) {
    const g = new THREE.Group();
    mesh(g, rbox(u(p.w), u(p.h), u(p.d), 0.06), M.filmYellow, 0, u(p.h) / 2, 0);
    return g;
  },

  disc(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2, t = u(p.t);
    const lens = mesh(g, new THREE.SphereGeometry(1, 40, 24), p.color === 'teal' ? M.teal : M.amber, 0, r * 0.98 + 0.03, 0);
    lens.scale.set(r, r, t * 0.6);
    leads(g, [[-r * 0.45, 0], [r * 0.45, 0]], r * 0.6);
    return g;
  },

  // Disc capacitor bent over and lying almost flat on the board (the blue discs by C12 in 1-Photo-1.jpg).
  discflat(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2, t = u(p.t), tilt = THREE.MathUtils.degToRad(p.tilt || 15);
    const body = new THREE.Group(); g.add(body);
    const lens = mesh(body, new THREE.SphereGeometry(1, 40, 20), M.blueDisc, 0, 0, 0);
    lens.scale.set(r, t * 0.55, r * 0.82);
    body.rotation.x = tilt;
    body.position.y = Math.sin(tilt) * r * 0.82 + t * 0.4;
    for (const s of [-1, 1]) wire(g, [[s * r * 0.3, body.position.y - 0.02, r * 0.55], [s * r * 0.3, 0.06, r * 0.95], [s * r * 0.3, 0.0, r * 1.05]], 0.016);
    return g;
  },

  fuse(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2, h = u(p.h);
    mesh(g, lathe(r, h), M.brown, 0, 0.03, 0);
    leads(g, [[-r * 0.4, 0], [r * 0.4, 0]], 0.06);
    return g;
  },

  filmcyl(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2, len = u(p.len);
    const body = mesh(g, new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.01), 8, 28), M.filmBrown, 0, r + 0.02, 0);
    body.rotation.z = Math.PI / 2;
    return g;
  },

  graycyl(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2, h = u(p.h);
    mesh(g, lathe(r, h, 0.22), M.gray, 0, 0.02, 0);
    wire(g, [[-r * 0.9, h * 0.9, 0], [-r * 1.5, h * 1.25, 0], [0, h * 1.5, 0], [r * 1.1, h * 1.2, 0], [r * 0.9, h * 0.9, 0]], 0.017);
    return g;
  },

  axial(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2, len = u(p.len);
    const body = new THREE.Group(); g.add(body);
    const mat = { amber: M.orange, blue: M.blueBody, black: M.black }[p.color] || M.orange;
    const caps = mesh(body, new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.01), 8, 24), mat, 0, r + 0.03, 0); caps.rotation.z = Math.PI / 2;
    for (const [i, c] of [[-1, 0x7a3b22], [-0.5, 0x2a2a2a], [0.05, 0xb59a2e]]) {
      if (p.color === 'black') break;
      const band = mesh(body, new THREE.CylinderGeometry(r * 1.02, r * 1.02, len * 0.07, 20), cached(`band${c}`, () => std(c, 0.5)), i * len * 0.18 + len * 0.15, r + 0.03, 0);
      band.rotation.z = Math.PI / 2;
    }
    for (const s of [-1, 1]) {
      wire(body, [[s * len / 2, r + 0.03, 0], [s * (len / 2 + 0.16), r + 0.03, 0], [s * (len / 2 + 0.2), 0.02, 0]], 0.022);
    }
    body.rotation.y = p.along === 'y' ? Math.PI / 2 : 0;
    return g;
  },

  led(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2, h = u(p.h);
    mesh(g, lathe(r, h, 0.5), M.led, 0, 0.03, 0);
    mesh(g, new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.025, 24), M.led, 0, 0.04, 0);
    leads(g, [[-r * 0.35, 0], [r * 0.35, 0]], 0.08);
    return g;
  },

  to92(p) {
    const g = new THREE.Group(); const r = u(p.d) / 2, h = u(p.h);
    const body = mesh(g, new THREE.CylinderGeometry(r, r, h, 28, 1, false, 0, Math.PI), M.plastic, 0, h / 2 + 0.03, 0);
    body.rotation.y = Math.PI / 2;
    leads(g, [[-r * 0.8, 0], [0, 0], [r * 0.8, 0]], 0.06, 0.015);
    return g;
  },

  jumper(p) {
    const g = new THREE.Group(); const half = u(p.len) / 2;
    const arc = [[-half, 0.02, 0], [-half + 0.08, 0.06, 0], [0, 0.07, 0], [half - 0.08, 0.06, 0], [half, 0.02, 0]];
    const w = wire(g, arc, 0.026); w.castShadow = false;
    g.rotation.y = p.along === 'y' ? Math.PI / 2 : 0;
    return g;
  },

  header(p) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const ring = mesh(g, new THREE.TorusGeometry(0.075, 0.022, 8, 20), M.ring, 0, 0.01, (i - 1.5) * 0.22); ring.rotation.x = Math.PI / 2;
    }
    return g;
  },

  pad(p) {
    const g = new THREE.Group(); const r = u(p.dia) / 2;
    const ring = mesh(g, new THREE.TorusGeometry(r * 0.72, r * 0.2, 8, 24), M.ring, 0, 0.008, 0); ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    return g;
  },

  removed(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d);
    const box = mesh(g, new THREE.BoxGeometry(w * 1.25, 0.9, d * 1.1), M.ghost, 0, 0.45, 0); box.castShadow = false; box.receiveShadow = false;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), cached('ghostEdge', () => new THREE.LineBasicMaterial({ color: 0xf0c27a, transparent: true, opacity: 0.85 })));
    edges.position.copy(box.position); g.add(edges);
    return g;
  }
};

// ---- solder-side bodies (built upward, hung under the board by the caller) ----
function pinsAlongZ(g, w, d, count, y, mat = M.tin) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const x = ((i + 0.5) / count - 0.5) * w * 0.92;
    for (const s of [-1, 1]) { const pin = new THREE.BoxGeometry(w * 0.4 / count, 0.02, 0.09); pin.translate(x, y, s * (d / 2 + 0.03)); geos.push(pin); }
  }
  return mesh(g, mergeGeometries(geos), mat);
}

const bodies = {
  ssop(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d);
    mesh(g, rbox(w * 0.9, 0.17, d * 0.64, 0.02), M.epoxy, 0, 0.09, 0);
    pinsAlongZ(g, w * 0.95, d * 0.64, 14, 0.03);
    return g;
  },
  soic(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d);
    mesh(g, rbox(w * 0.84, 0.16, d * 0.66, 0.02), M.epoxy, 0, 0.09, 0);
    pinsAlongZ(g, w * 0.9, d * 0.66, 4, 0.03);
    return g;
  },
  sop4(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d);
    mesh(g, rbox(w * 0.7, 0.2, d * 0.98, 0.03), M.epoxy, 0, 0.11, 0);
    const geos = [];
    for (const s of [-1, 1]) for (const z of [-0.5, 0.5]) { const pin = new THREE.BoxGeometry(0.11, 0.02, 0.06); pin.translate(s * (w * 0.35 + 0.05), 0.03, z * d * 0.55); geos.push(pin); }
    mesh(g, mergeGeometries(geos), M.tin);
    return g;
  },
  dpak(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d); const s = p.tab || 1;
    mesh(g, rbox(w * 0.74, 0.22, d * 0.8, 0.03), M.epoxy, -s * w * 0.06, 0.12, 0);
    mesh(g, rbox(w * 0.26, 0.03, d * 0.72, 0.01), M.tin, s * w * 0.4, 0.02, 0);
    for (const z of [-0.3, 0.3]) mesh(g, new THREE.BoxGeometry(0.16, 0.02, 0.07), M.tin, -s * (w * 0.43 + 0.04), 0.03, z * d);
    return g;
  },
  shunt(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d);
    // 'R050' is the marking read on the part (pcb-macros photos), not a guess.
    mesh(g, rbox(w * 0.76, 0.13, d * 0.92, 0.02), cached('shuntR050', () => std(0xffffff, 0.55, 0, { map: labelTexture('R050', '#ddd9cc', '#222') })), 0, 0.075, 0);
    for (const s of [-1, 1]) mesh(g, rbox(w * 0.2, 0.15, d, 0.02), M.tin, s * w * 0.4, 0.08, 0);
    return g;
  },
  sma(p) {
    const g = new THREE.Group(); const w = u(p.w), d = u(p.d);
    mesh(g, rbox(w * 0.9, 0.16, d * 0.7, 0.02), M.epoxy, 0, 0.09, 0);
    for (const s of [-1, 1]) mesh(g, rbox(w, 0.04, d * 0.16, 0.01), M.tin, 0, 0.03, s * d * 0.42);
    return g;
  }
};

/** Model-space anchor (board units) that a part's group origin sits on. */
export function anchorOf(p) {
  return p.kind === 'bracket' ? [p.x, p.y0] : [p.x, p.y];
}

/** Build the 3D stand-in for a part, or null when the part is only a legend/hotspot. */
export function buildPart(p) {
  const build = p.side === 'top' ? builders[p.kind] : bodies[p.kind];
  if (!build) return null;
  const g = build(p);
  g.userData.partId = p.id;
  g.traverse(o => { if (o.isMesh) { o.userData.partId = p.id; } });
  return g;
}

export const materials = M;
