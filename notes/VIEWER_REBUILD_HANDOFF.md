# Viewer Rebuild Handoff - 2026-09-24

Status: DONE (2026-09-24). Scene and UI rebuilt on `feat/atlas-rebuild-opus-audit` (`src/scene.js`, `src/main.js`, `src/store.js`, `src/geometry.js`, `src/style.css`). Audit results and open decisions: `notes/ATLAS_AUDIT.md`. The notes below are the original plan, kept for context.

## Why the rebuild
The first atlas had a wrong board outline (tab on the wrong side, mat texture bleeding through), part positions that were off the board or in an inconsistent frame, fake decorative pads/hatching, ~700 unshared meshes plus a continuous render loop with 2048px canvas textures decoded at runtime (stutter), and a blurry 64% photo overlay double-drawing every tall part.

## Done (files on disk, uncommitted)
- `scripts/rectify_photos.py` - perspective-corrects the evidence photos (6 corner correspondences each) into one shared frame and writes `evidence/derived/2026-09-24/board-top.jpg` (tall parts painted out) and `board-bottom.jpg` (mirrored into top-view coordinates). Needs `pip install numpy opencv-python-headless`. Originals untouched.
- `src/board.json` - single source of truth: `size` (W 1071, H 1361, main block height 907, tab width 358), `outline` polygon (mounting notches measured), `holes` (cross slot, long slot, four round holes under the transformer), `parts[]`, `unplaced[]`. Units are photo-rectified board units (about 0.1 mm assumed, NOT measured). Origin top-left of main block, x right, y down, component-side view. A part has the same x/y on both sides.
- `src/board-data.js` - imports the JSON; exports outline, holes, parts, textures, photos, keyParts, `halfExtent`, `footprintCentre`, `kindLabel`.
- `src/parts.js` - stylised 3D builders (transformer, bracket, electrolytic caps, choke, film caps, discs, fuse, LED, jumpers, DPAK/SSOP/SOIC/SOP4/shunt bodies). Scene scale K = 0.01. `buildPart(p)` returns a Group at the part base (+Y up) or null for legend-only parts; `anchorOf(p)`. Solder-side bodies are built upward; hang them under the board with `scale.y = -1`.

## Design decisions for main.js (not yet written)
- Scene coords: X = (x - cx) * K, Z = (y - cy) * K, board thickness 16 units, centre the assembly on the L-shape.
- Board body: ExtrudeGeometry from the outline plus holes. Photo skins are ShapeGeometry with uv u = x/W, v = 1 - y/H, top skin above and bottom skin below; both textures use the same mapping. Flip to the solder side by rotating the assembly about Z by PI (animated); the bottom texture then reads un-mirrored.
- Performance: render on demand (invalidate on controls change / tween / hover), `controls.update()` return value keeps damping alive, static shadow map updated only when needed (every frame during tweens), no per-frame work otherwise, shared materials, pointer hit-testing = tall-part mesh raycast, then ray-to-board-plane + nearest anchor within a radius. Load textures with TextureLoader (no canvas redraw) and show a loading state.
- Look: RoomEnvironment PMREM, ACES tone mapping, soft key-light shadows, ShadowMaterial floor that moves so it stays under the lowest geometry (top vs flipped), radial CSS backdrop, CSS2DRenderer label chips (key parts always, hover/selected, "All labels" toggle), hotspot rings for small SMD/test-point anchors, camera fly-to on select, view presets (plan / 3-4 / edge-on).
- Keep every existing feature: reference index + search, inspector record form, confidence, add/relocate marker, photo viewer, JSON export/import, mobile layout (390px and 320px). Storage key must move to `...-board-atlas-v2` (schema 2: notes, position overrides, custom markers). Migrate notes only from v1 (old x/z were in a different frame); accept schema-1 imports as notes-only.
- Update `scripts/verify.mjs` for the new UI. Add a small data guard (`scripts/check-data.mjs`, `npm run test:data`): every part footprint lies inside the outline and outside the holes. Only necessary tests (Carter's rule).

## Known data caveats (say these in the UI/docs, do not hide them)
- Solder-side small parts are hotspot anchors at the OCR'd silkscreen legend position, within roughly 5-10 units of the part; only U3, U4, U5, U6, Q6, Q7, Q14, Q15, R27, D8 have real body footprints.
- IDs changed versus the first atlas: `U8` is `U3` (legend read on the photo); `F4` is `F2`; top-side `D8`, `L1`, and top-side `L2` were misreads (`L2` is a solder-side SMD; `D8` is solder-side; `L1` not relocated); top-side `C8`, `C9`, `C10` were guesses (a `C8` exists on the solder side as an SMD) so the four left electrolytics are now `X-EL-L1..L4`, the two mid ones `X-EL-M1/M2`.
- `X-` prefix = unlabeled part named by appearance. `C2` designator is carried from earlier notes (not legible). `T1` is the transformer per the inventory, but the board also has a small `T1` test-pad legend near J14 - flag this for Carter.
- Unplaced (legend not relocated): ZD1, C18, C43.
- Bracket height/lean, cap heights, and transformer core shape are estimates from oblique photos (`board-overview/2,4,5`).
- Tall-part base positions were parallax-corrected by eye against `artifacts/work/fp_overlay.py` overlays; re-check them against the rendered scene.
- `C1` may legitimately overhang the bottom edge of the board slightly in the real hardware; keep it inside unless the photos show otherwise.

## Scratch (not part of the deliverable)
- `artifacts/work/` (gitignored) holds OCR output, generators (`gen_board.py`, `cands2.py`, `manual.json`), overlay tools. `scripts/_shot.mjs` was folded into `scripts/verify.mjs` and deleted.
- A Vite dev server may still be running on http://127.0.0.1:5173.

## Before finishing
Run `git diff --check`, review `git status --short`, add an entry to `notes/EVIDENCE_LOG.md` for the derived textures (source filenames: 1-Photo-1.jpg, 3-Photo-3.jpg), update `README.md` and `notes/SESSION_HANDOFF.md`. Do not commit or push unless Carter asks.
