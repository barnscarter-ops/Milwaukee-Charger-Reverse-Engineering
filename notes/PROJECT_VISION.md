# Project Vision

## Why this exists

The charger is a compact, real-world example of an isolated switch-mode power supply and a battery-management controller. This project turns its teardown into a reproducible explanation of how a commercial charger accepts AC power, produces isolated DC power, identifies M12/M18 packs, measures current, and controls a charge cycle.

## Primary questions

1. What is the complete power path from AC input to pack contacts?
2. Which components establish isolation and which components cross it through feedback?
3. How does the controller identify M12 versus M18 packs and monitor temperature/status contacts?
4. Where and how is current measured?
5. What voltage/current/power range is expected at each confirmed stage?

## Deliverables

- Annotated board-zone map.
- Component inventory with ratings and source links.
- Pin map for the removed battery contacts.
- Functional block diagram.
- Low-voltage control/output schematic.
- Primary flyback supply schematic around U1 and the transformer.
- Calculation notebook for current shunt, rectification, filtering, switching, and output stages.
- Final explanation written for a learner.

## Non-goals

- Repairing, energizing, or reusing the charger as a mains-powered device.
- Treating incomplete evidence as a final schematic.
- Using the charger board as a donor for a live Arduino supply.

## Definition of done

Every major path has a source photo, component identifier, net-trace evidence, and a confidence level. Unknown areas remain labeled unknown rather than silently filled in.
