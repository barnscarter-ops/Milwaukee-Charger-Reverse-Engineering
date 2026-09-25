# Evidence Log

## 2026-09-24 - Initial charger and U1 evidence

Source folder: `evidence/2026-09-24/charger-label-and-u1/`

- Charger nameplate identifies Milwaukee 48-59-1812, 120 V AC input and 12-18 V DC, 3 A output.
- Removed U1 is heat-sunk and has six physical leads.
- Main transformer, large capacitors, and primary-side layout are visible.

## 2026-09-24 - Board overview

Source folder: `evidence/2026-09-24/board-overview/`

- PCB marking: 860323007 Rev 0.6; date marking 2015-10-22.
- The board has a visually clear primary/secondary isolation barrier with slots and hatched keep-out markings.
- The power whip, M12 contact assembly, M18 contact assembly, U1, and heat sink were removed and retained.

## 2026-09-24 - PCB macro evidence

Source folder: `evidence/2026-09-24/pcb-macros/`

- R27 is visibly marked `R050`.
- Large Q6/Q15 power devices and U4 controller region are visible.
- Removed battery-contact pad areas are documented; copper/through-hole condition must be treated carefully when tracing.

## 2026-09-24 - Derived board textures (Board Atlas)

Output folder: `evidence/derived/2026-09-24/` (derived; originals untouched). Script: `scripts/rectify_photos.py`.

- `board-top.jpg` from `board-overview/1-Photo-1.jpg`: perspective-corrected with 6 corner correspondences into board units (1 unit = 1.8 px, scale about 0.1 mm assumed, not measured); edge pixels inpainted; tall parts painted out so the 3D models do not double-draw.
- `board-bottom.jpg` from `board-overview/3-Photo-3.jpg`: same correction, mirrored into the component-side view, then registered to `board-top.jpg` with a smoothed thin-plate spline on 33 through-hole tie points (pads, jumper holes, U1 pins, slots). Residual mean 1.2, max 3.1 units; confidence probable.
- Isolation keep-out traced by eye on `board-bottom.jpg` (about 10 units); stored in `src/board.json` as `isolation`, confidence probable.
- Legend corrections read on these crops: R1 and R3 re-anchored, TP26/ZD11 separated, R41 added, R33 and R92 unplaced (their anchors read R93 and R94). Slot under U5/U6 added (bodies visible through it in 1-Photo-1.jpg). Details: `notes/ATLAS_AUDIT.md`.

## Open evidence requests

- Ruler or tape-measure photo for board-scale reference.
- Clean U1 marking photo.
- Contact-assembly close-ups.
- Future continuity readings recorded by source pad and destination pad.
