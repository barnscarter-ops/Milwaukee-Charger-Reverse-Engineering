# Teardown Plan

## Current state

Removed and retained:

- AC power whip.
- M12 battery contact assembly.
- M18 battery contact assembly.
- U1 and its heat sink.

Remain installed for mapping:

- Main transformer.
- Primary capacitors, rectifier, input protection, and EMI parts.
- Secondary rectification/current-sense/power-switching hardware.
- Low-voltage controller section.

## Phase 1: Freeze and catalog

1. Do not remove additional components until photographed and logged.
2. Photograph each removed item front/back with its board designator or original location.
3. Capture a ruler-based, straight-down image of each PCB side.
4. Build the component inventory from readable markings.

## Phase 2: Establish zones

1. Mark AC input, rectified bulk DC, primary switch, transformer, isolation barrier, secondary output, pack contacts, and controller areas.
2. Record every visible isolation slot, safety capacitor, optocoupler, and transformer winding group.
3. Create the first block diagram before tracing individual small-signal nets.

## Phase 3: Map the output/control side

1. Identify each removed pack-contact pin and its PCB pad.
2. Trace pack-positive, pack-negative, temperature/status, and sense paths while unpowered.
3. Map the R27 current-sense resistor and its amplifier/controller path.
4. Identify output MOSFETs, gate drivers, protection diodes, and controller supply rails.

## Phase 4: Map the flyback supply

1. Identify U1's exact TOPSwitch marking and datasheet.
2. Map U1 pad-to-net connections without assuming pin functions.
3. Trace the primary transformer winding, bulk capacitors, input bridge, snubber/clamp network, and feedback path.
4. Trace the secondary rectifier/filter path to the low-voltage output.

## Phase 5: Document and calculate

1. Draw each confirmed section in the schematic tool.
2. Add component ratings and calculation worksheets.
3. Review all assumptions against photos, continuity notes, and datasheets.
4. Publish a final diagram with confidence labels.

## Needed next

- Overhead photos with a ruler or tape measure.
- Sharp, glare-free photo of U1's face under angled light.
- Photos of both removed contact assemblies, including every terminal.
- Continuity readings only after a net map template has been created.
