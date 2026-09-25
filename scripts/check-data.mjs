// Data guard for src/board.json: catches silent placement errors before they reach the viewer.
// Every placed part's footprint samples (centre, corners, edge midpoints) must lie inside the board outline and
// outside every cut-out, designators must be unique, and no two parts on one face may share an anchor.
// A part may sit over cut-outs only when it says so in `bridges` (T1 over the four round holes).
// Run: npm run test:data
import { readFile } from 'node:fs/promises';
import { pointInPolygon, footprintSamples, halfExtent, footprintCentre as centre } from '../src/geometry.js';

const board = JSON.parse(await readFile(new URL('../src/board.json', import.meta.url), 'utf8'));

const problems = [];
const seen = new Map();
for (const p of [...board.parts, ...board.unplaced]) {
  if (seen.has(p.id)) problems.push(`${p.id}: duplicate designator`);
  seen.set(p.id, p);
}
for (const p of board.parts) {
  const [cx, cy] = centre(p);
  const [hx, hy] = halfExtent(p);
  if (![cx, cy, hx, hy].every(Number.isFinite)) { problems.push(`${p.id}: missing geometry`); continue; }
  for (const [x, y] of footprintSamples(cx, cy, hx, hy)) {
    if (!pointInPolygon(x, y, board.outline)) { problems.push(`${p.id}: footprint point (${x.toFixed(1)}, ${y.toFixed(1)}) is outside the board outline`); break; }
    if (!p.bridges && board.holes.some(h => pointInPolygon(x, y, h))) { problems.push(`${p.id}: footprint point (${x.toFixed(1)}, ${y.toFixed(1)}) falls in a cut-out`); break; }
  }
}
for (let i = 0; i < board.parts.length; i++) {
  for (let j = i + 1; j < board.parts.length; j++) {
    const a = board.parts[i], b = board.parts[j];
    if (a.side === b.side && Math.hypot(a.x - b.x, a.y - b.y) < 5) problems.push(`${a.id} and ${b.id}: anchors within 5 units on the ${a.side} side`);
  }
}
if (problems.length) {
  console.error(`board.json: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`board.json OK: ${board.parts.length} placed parts inside the outline and clear of ${board.holes.length} cut-outs; ${board.unplaced.length} unplaced.`);
