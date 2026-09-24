# Session Handoff - 2026-09-24

## State at close

- Repository: `C:\Workspace\Active\Milwaukee-Charger-Reverse-Engineering`.
- Branch: `main`. The 3D viewer was committed as `1abb8f0`.
- No Git remote is configured. This repository is local only until Carter chooses a GitHub destination.
- Charger remains disassembled and unpowered. No live electrical testing was performed.

## Board Atlas

- Two-sided Three.js reconstruction with a switchable photographic PCB surface.
- 85 reference designators are mapped from the readable photos: 21 component-side, 64 solder-side.
- Click a component or search the index to edit identification, measurements, role, observations, evidence, and confidence.
- Add and relocate markers as better photos and measurements establish their positions.
- Browser records are local to the device. Export JSON before changing browsers or computers; commit an exported record file when it becomes project evidence.
- U1 is modeled as an empty footprint because it was removed during the teardown.
- Geometry and locations are photo estimates, not dimensions or circuit assertions. Smaller components remain unmapped.

## Verified

- `npm run build` completed successfully.
- `npm run test:visual` passed on 1440px desktop, 390px phone, and 320px phone viewports; canvas-pixel checks found nonblank boards on both sides, and browser interactions had no page errors.
- The viewer was served on this laptop's Tailscale address at `http://100.75.200.127:5173/` and returned HTTP 200. This address may change; the server must be restarted after a reboot.

## Next session

1. Check `git status --short --branch` and the remote configuration before changing files.
2. Read `AGENTS.md`, `notes/PROJECT_VISION.md`, and `notes/TEARDOWN_PLAN.md`.
3. Collect a ruler measurement and squared-up macro photos of each PCB region, both sides. Preserve originals in `evidence/`.
4. Correct marker placement and add the remaining readable designators; do not prefill part functions or values by appearance alone.
5. Export any records entered on the phone and add the JSON to the repo only after reviewing it for accurate evidence and private information.
6. Continue the unpowered trace and component inventory before drawing the detailed schematic or calculating per-component electrical values.
