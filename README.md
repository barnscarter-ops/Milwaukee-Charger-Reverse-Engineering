# Milwaukee Charger Reverse Engineering

## Interactive board atlas

Run `npm install` once, then `npm run dev` and open the local URL. The atlas is a two-sided, interactive 3D reconstruction of the charger PCB. Click a board reference designator to record identification, measurements, circuit role, observations, source, and confidence. The component index is searchable; `Add reference` lets you place a newly identified marking on the board. `Relocate marker` lets you correct an estimated position by clicking the PCB. The photographic surface can be toggled, and the source photographs can be opened separately. Records autosave in this browser and can be exported/imported as JSON for travel between computers and Git archival.

The 3D positions are estimated from the evidence photographs, **not measured geometry**. Some small components remain unmapped until their silkscreen designators can be read; the original photos remain the authority. U1 is represented by its empty footprint because it was removed during teardown. No circuit functions or values are prefilled.

For a viewer regression check, keep `npm run dev` running and use `npm run test:visual` in a second terminal. The test uses installed Edge on Windows or Playwright Chromium elsewhere; set `BROWSER_EXECUTABLE` to override the browser path. Screenshots are written to the ignored `artifacts/` folder.

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

- `evidence/` - Original photo evidence, grouped by capture set.
- `notes/PROJECT_VISION.md` - Scope, non-goals, and deliverables.
- `notes/TEARDOWN_PLAN.md` - Current work plan and data-collection order.
- `notes/COMPONENT_INVENTORY.md` - Confirmed and provisional part identifications.
- `notes/EVIDENCE_LOG.md` - Evidence register and observations.
- `schematic/` - Future block diagrams and schematic files.

Read `AGENTS.md` before making changes.
