// Board geometry and part placement, in photo-rectified board units (see src/board.json).
// Origin is the top-left of the main block, x to the right, y down, viewed from the component side.
// The solder-side photo is mirrored into the same frame, so a part has the same x/y on both sides.
// Positions are photographic estimates, not measured geometry.
import board from './board.json';

export const SIZE = board.size;
export const THICKNESS = board.thickness;
export const outline = board.outline;
export const holes = board.holes;
export const isolation = board.isolation;
export const parts = board.parts;
export const unplaced = board.unplaced;
export const UNITS_NOTE = board.units;

export const textures = {
  top: new URL('../evidence/derived/2026-09-24/board-top.jpg', import.meta.url).href,
  bottom: new URL('../evidence/derived/2026-09-24/board-bottom.jpg', import.meta.url).href
};

// Original evidence photographs (never modified), in the order the photo viewer shows them.
// Literal URLs so Vite can resolve and bundle each file.
const photo = (src, label) => ({ label, file: decodeURIComponent(src.split('/2026-09-24/').pop().split('?')[0]), src });
export const photos = [
  photo(new URL('../evidence/2026-09-24/board-overview/1-Photo-1.jpg', import.meta.url).href, 'Component side, overview'),
  photo(new URL('../evidence/2026-09-24/board-overview/3-Photo-3.jpg', import.meta.url).href, 'Solder side, overview'),
  photo(new URL('../evidence/2026-09-24/board-overview/2-Photo-2.jpg', import.meta.url).href, 'Oblique view: left capacitors, M12/M18 pads, removed contact assembly'),
  photo(new URL('../evidence/2026-09-24/pcb-macros/1-Photo-1.jpg', import.meta.url).href, 'Solder side: U4 controller area'),
  photo(new URL('../evidence/2026-09-24/pcb-macros/2-Photo-2.jpg', import.meta.url).href, 'Solder side: R27 and the control area'),
  photo(new URL('../evidence/2026-09-24/pcb-macros/3-Photo-3.jpg', import.meta.url).href, 'Solder side: Q6, Q7, Q14, Q15 and the cross slot'),
  photo(new URL('../evidence/2026-09-24/pcb-macros/4-Photo-4.jpg', import.meta.url).href, 'Solder side: U1 pads, U5 and U6 across the barrier'),
  photo(new URL('../evidence/2026-09-24/pcb-macros/5-Photo-5.jpg', import.meta.url).href, 'Solder side: primary area'),
  photo(new URL('../evidence/2026-09-24/pcb-macros/6-Photo-6.jpg', import.meta.url).href, 'Solder side, detail'),
  photo(new URL('../evidence/2026-09-24/board-overview/4-Photo-4.jpg', import.meta.url).href, 'Removed U1, face'),
  photo(new URL('../evidence/2026-09-24/board-overview/5-Photo-5.jpg', import.meta.url).href, 'Removed U1, face (second exposure)'),
  photo(new URL('../evidence/2026-09-24/charger-label-and-u1/1-Photo-1.jpg', import.meta.url).href, 'Removed U1 on its heat sink'),
  photo(new URL('../evidence/2026-09-24/charger-label-and-u1/2-Photo-2.jpg', import.meta.url).href, 'Removed U1 on its heat sink, second angle'),
  photo(new URL('../evidence/2026-09-24/charger-label-and-u1/3-Photo-3.jpg', import.meta.url).href, 'Charger nameplate')
];

// Parts that get a permanent label chip in the default view.
export const keyParts = new Set(['T1', 'U1', 'C1', 'C2', 'C3', 'F1', 'NTC1', 'VR1', 'R27', 'U3', 'U4', 'U5', 'U6', 'Q6', 'Q7', 'Q14', 'Q15', 'X-BRACKET', 'X-BRIDGE', 'X-CHOKE']);

const KIND_LABEL = {
  xfmr: 'Transformer', bracket: 'Aluminium bracket', elcap: 'Electrolytic capacitor', block: 'Rectifier-style block', choke: 'Choke',
  film: 'Film capacitor', disc: 'Disc component', discflat: 'Disc component (lying)', fuse: 'Radial fuse', filmcyl: 'Film capacitor', graycyl: 'Cylindrical part', axial: 'Axial part',
  led: 'LED', to92: 'TO-92 device', jumper: 'Wire jumper', header: 'Header pads', pad: 'Solder pad', marker: 'Legend only', removed: 'Removed footprint',
  ssop: 'SSOP IC', soic: 'SOIC IC', sop4: 'SOP-4 device', dpak: 'DPAK device', shunt: 'Resistor marked R050', sma: 'Diode body', tp: 'Test point', smd: 'Surface-mount part',
  'smd-custom': 'Added marker'
};
export const kindLabel = kind => KIND_LABEL[kind] || 'Part';

export { halfExtent, footprintCentre } from './geometry.js';
