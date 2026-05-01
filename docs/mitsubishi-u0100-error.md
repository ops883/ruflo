# Mitsubishi DTC U0100 — Lost Communication With ECM/PCM 'A'

## Overview

**U0100** is an OBD-II network communication Diagnostic Trouble Code (DTC) that means the vehicle's control modules have lost communication with the Engine Control Module (ECM) or Powertrain Control Module (PCM), referred to as "ECM/PCM 'A'".

This is a CAN (Controller Area Network) bus fault — the high-speed data network that allows the ECM/PCM to communicate with other modules such as the TCM (Transmission Control Module), BCM (Body Control Module), ABS module, and instrument cluster.

---

## Affected Mitsubishi Models

U0100 has been reported across a wide range of Mitsubishi vehicles including:

| Model | Common Years |
|-------|-------------|
| Outlander | 2003–present |
| Eclipse Cross | 2018–present |
| Galant | 2004–2012 |
| Lancer / Lancer Evolution | 2002–2017 |
| Montero / Montero Sport | 2001–2006 |
| Endeavor | 2004–2011 |
| Raider | 2006–2009 |

---

## Symptoms

When U0100 is set, you may observe one or more of the following:

- **Check Engine Light** (MIL) illuminated
- Multiple warning lights on simultaneously (ABS, Traction Control, Airbag, etc.)
- Vehicle **cranks but does not start**
- Engine stalls or runs rough
- Automatic transmission stuck in a single gear or limp mode
- No response from dashboard gauges
- Remote start or keyless entry inoperative
- Multiple DTCs set across different modules

---

## Common Causes

### 1. Low or Failed Battery Voltage
The CAN bus requires stable voltage to operate. A weak battery (below ~11.5V) or failing alternator is one of the most frequent root causes.

### 2. Corroded or Damaged CAN Bus Wiring
The CAN bus uses a twisted pair of wires (CAN High and CAN Low). Damage, corrosion, shorts, or open circuits in these wires disrupt communication.

### 3. Poor or Missing Ground Connections
ECM/PCM grounds are critical. A high-resistance or missing ground causes the module to behave erratically or go offline on the CAN network.

### 4. Water Intrusion
Water in the ECM/PCM connector, fuse box, or junction block can cause intermittent or permanent communication failures.

### 5. Faulty ECM/PCM
The ECM/PCM itself may have failed internally, causing it to drop off the CAN network.

### 6. Blown Fuse or Failed Relay
The ECM/PCM power supply fuse or main relay failure cuts power to the module, which appears as a lost-communication fault to other modules.

### 7. Failed CAN Bus Terminating Resistor
The CAN network uses 120-ohm terminating resistors at each end of the bus. A failed resistor changes bus impedance and disrupts communication for all connected modules.

---

## Diagnostic Procedure

### Step 1: Check Battery and Charging System
- Measure battery voltage with engine off (should be 12.4–12.7V)
- Measure charging voltage with engine running (should be 13.8–14.7V)
- Load-test the battery
- Repair or replace as needed before proceeding

### Step 2: Inspect Fuses and Relays
- Locate the ECM/PCM fuse(s) in the underhood fuse box and interior fuse block (refer to the owner's manual for the exact fuse number/amperage for your model)
- Check the ECM main relay
- Replace any blown fuses and retest

### Step 3: Check Ground Connections
- Inspect ECM/PCM chassis grounds (typically located on the firewall or engine block)
- Remove ground bolts, clean contact surfaces with a wire brush, and reinstall securely
- Measure resistance between the ECM ground pin and chassis ground (should be <0.5Ω)

### Step 4: Inspect CAN Bus Wiring
With the battery disconnected:
- Locate the CAN High (typically yellow/white) and CAN Low (typically green/white) wires at the OBD-II port (pins 6 and 14)
- Inspect for visible damage, chafing, or corrosion along the harness run to the ECM/PCM
- Repair any damaged sections with proper butt connectors or solder-and-heat-shrink

### Step 5: Measure CAN Bus Resistance
With the battery disconnected and ignition off:
1. At the OBD-II port, measure resistance between pin 6 (CAN High) and pin 14 (CAN Low)
2. A healthy network with two 120Ω terminating resistors in parallel reads approximately **60Ω**
3. A reading of 120Ω indicates one resistor is missing/open
4. A reading near 0Ω indicates a short between CAN High and CAN Low
5. An infinite reading indicates an open circuit on the bus

### Step 6: Check for Water Intrusion
- Inspect the ECM/PCM connector (typically located behind the glove box, under the hood near the firewall, or under the dashboard) for moisture, corrosion, or green oxidation on terminals
- Use electrical contact cleaner and dielectric grease after cleaning
- If the ECM/PCM housing shows signs of water entry, the unit may need replacement

### Step 7: Scan All Modules
- Using a scan tool capable of reading all modules (not just engine codes), check for additional U-codes in other modules
- Multiple modules reporting U0100 simultaneously points to an ECM/PCM power/ground issue rather than a wiring fault between two specific modules
- A single module reporting U0100 while others can still communicate may indicate a wiring issue specific to that module's path to the ECM/PCM

---

## Repair Cost Estimates

| Repair | Estimated Cost (parts + labor) |
|--------|-------------------------------|
| Battery replacement | $150–$250 |
| Alternator replacement | $300–$600 |
| Ground strap/cable repair | $50–$150 |
| Wiring harness repair | $150–$500+ |
| ECM/PCM replacement (remanufactured) | $400–$900 |
| ECM/PCM programming (if required) | $100–$250 |

> **Note:** Prices vary significantly by region, model year, and labor rates. Mitsubishi ECM/PCM units often require dealer programming after replacement.

---

## Can I Drive With U0100?

**No — avoid driving until the fault is diagnosed.**

U0100 indicates a fundamental breakdown in vehicle network communication. Depending on severity:

- The vehicle may not start
- Safety systems (ABS, stability control, airbags) may be non-functional
- The transmission may be in limp mode, limiting vehicle speed
- The engine may stall without warning

---

## Clearing the Code

After repairing the underlying fault:

1. Connect an OBD-II scan tool
2. Clear DTCs from **all modules** (not just the engine module)
3. Perform a complete drive cycle
4. Verify the code does not return

If U0100 returns immediately after clearing, the root cause has not been resolved.

---

## Related Codes

| DTC | Description |
|-----|-------------|
| U0001 | High Speed CAN Communication Bus |
| U0073 | Control Module Communication Bus Off |
| U0101 | Lost Communication With TCM |
| U0121 | Lost Communication With ABS Control Module |
| U0140 | Lost Communication With BCM |
| U0155 | Lost Communication With Instrument Panel Cluster |

---

*Always refer to the model-specific Mitsubishi service manual for wiring diagrams and module locations before beginning diagnosis.*
