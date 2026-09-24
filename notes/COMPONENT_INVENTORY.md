# Component Inventory

Confidence levels: confirmed = direct marking/evidence; probable = strong package/location evidence; unknown = not yet identified.

| Ref | Identification | Role | Confidence | Notes |
| --- | --- | --- | --- | --- |
| U1 | Power Integrations TOPSwitch-family offline switcher | Primary flyback controller and internal high-voltage MOSFET | Probable | Removed. Six physical leads match a TO-220-7C-style package with one omitted position. Exact suffix is unreadable in current evidence. |
| T1 | Main flyback transformer | Isolation and power transfer | Confirmed | Large yellow transformer at center of board. |
| R27 | 0.050 ohm shunt resistor (`R050`) | Current measurement candidate | Confirmed | A 3 A path would create 0.15 V across it and dissipate 0.45 W. Exact measured branch remains to be traced. |
| Q6, Q15 | Power MOSFETs or power-switch devices | Output/secondary switching candidate | Probable | Large DPAK-style devices near output-side routing. |
| U4 | Main microcontroller | Pack monitoring and charge control | Probable | Large QFP on low-voltage control section; marking not yet captured. |
| F1 | 3.15 A, 250 VAC fuse | AC input protection | Confirmed | Marked on primary side. |
| NTC1 | NTC thermistor | Inrush-current limiting | Confirmed | Marked on primary side. |
| Bridge rectifier | Four-terminal rectifier block | AC-to-DC conversion | Probable | Large black block adjacent to primary capacitors. |
| M12 contact assembly | Removed pack interface | M12 pack connection | Confirmed | Needs pin map. |
| M18 contact assembly | Removed pack interface | M18 pack connection | Confirmed | Needs pin map. |
