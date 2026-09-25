# Milwaukee Charger Reverse Engineering

## Interactive board atlas

Run `npm install` once, then `npm run dev` and open http://127.0.0.1:5173/. The atlas is a two-sided 3D reconstruction of the charger PCB built from two rectified photographs (`evidence/derived/2026-09-24/`). Flip between the component and solder sides, switch plan / 3/4 / edge views, search the reference index, and click a part to record identification, measurements, role, observations, evidence and confidence. Add or relocate markers by clicking the board. The record panel shows the part cropped from both photos.

Layers: **X-ray** shows the other face through the board in register (with a lens); **Isolation** colours the traced primary and secondary regions and the keep-out barrier and lists parts on or across it; **Continuity** logs unpowered continuity and resistance readings, draws them on the board, groups them into neutral nets (NET-ref-pin) and flags primary-to-secondary pairs.

Records save in this browser (schema 2, key `milwaukee-48-59-1812-board-atlas-v2`; notes from the first atlas migrate automatically, positions do not) and export or import as JSON. Schema-1 files import as notes only.

Positions, heights and shapes are estimates from photos, **not measured geometry**; the UI says so. No circuit function or value is prefilled. U1 is shown as its empty footprint (removed during teardown).

Checks (dev server running): `npm run test:data` (every footprint inside the outline and clear of cut-outs), `npm run test:visual` (functional checks; add `-- --shots --perf` for the screenshot matrix and frame times). Edge is used on Windows; set `BROWSER_EXECUTABLE` elsewhere. Output goes to the ignored `artifacts/` folder. To regenerate the textures: `pip install numpy opencv-python-headless`, then `python scripts/rectify_photos.py`.

Reverse engineering record for a Milwaukee M12/M18 multi-voltage charger.

## Project status

The charger is disassembled and unpowered. This repository begins with preserved photos, an initial component inventory, and a plan for creating a traceable functional schematic.

## Board under study

- Charger: Milwaukee 48-59-1812 M12/M18 Multi-Voltage Charger
- Nameplate: 120 V AC, 60 Hz, 2.1 A input; 12-18 V DC, 3 A output
- PCB part number: 860323007 Rev 0.6
- Board date marking: 2015-10-22

## Goals

1. Understand the full energy path from AC input to battery contacts.
2. Document control, protection, pack identification, and charge-current measurement circuits.
3. Produce a staged, evidence-backed schematic in `schematic/`.
4. Calculate expected voltage, current, power, and component stress for each confirmed stage.
5. Preserve the work as a learning reference rather than attempt a powered repair.

## Repository map

- `evidence/` - Original photo evidence, grouped by capture set; `evidence/derived/` holds generated textures (never edit originals).
- `src/` - Board Atlas viewer; `src/board.json` is the single source of board geometry and part placement.
- `scripts/` - Texture rectification, data guard, and the visual regression check.
- `notes/PROJECT_VISION.md` - Scope, non-goals, and deliverables.
- `notes/TEARDOWN_PLAN.md` - Current work plan and data-collection order.
- `notes/COMPONENT_INVENTORY.md` - Confirmed and provisional part identifications.
- `notes/EVIDENCE_LOG.md` - Evidence register and observations.
- `notes/SESSION_HANDOFF.md` - Latest viewer status and next-session checklist.
- `notes/ATLAS_AUDIT.md` - Board Atlas audit findings, measured frame times, open decisions.
- `schematic/` - Future block diagrams and schematic files.

Read `AGENTS.md` before making changes.
