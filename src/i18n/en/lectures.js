// English translation of src/labs/lectures.js (Vietnamese is the source of truth).
// Same order and counts as the Vietnamese file; outcome codes, quiz answers and durations come from the vi source.

export const COURSE_INFO_EN = {
  title: 'PLC Programming and Pneumatic Control',
  subtitle: 'Hands-on with a simulated S7-1200-style PLC',
};

export const LECTURES_EN = {
  /* ======================= PART 1 — PLC BASICS ======================= */
  L01: {
    outcomes: [
      'Describe the structure of a PLC system: power supply, CPU, digital inputs (DI), digital outputs (DQ), scan cycle.',
      'Read and write %I, %Q, %M addresses correctly; create a tag table with meaningful names.',
      'Program LAD with NO contacts, NC contacts and coils; combine them in series (AND) and in parallel (OR).',
      'Distinguish NO/NC push buttons and PNP/NPN sensors; explain why an NPN sensor does not work with a sinking input.',
    ],
    sections: [
      {
        title: '1. What is a PLC?',
        body: `A PLC (Programmable Logic Controller) is an industrial computer that reads signals from push buttons and sensors and then controls lamps, valves, contactors and motors according to the program written by the programmer.

Compared with relay logic, a PLC replaces dozens of relays and wires with a **program**: to change a function you only edit the program, with no rewiring.

### Components of an S7-1200-style PLC system
- **24 VDC power supply** for the CPU, the sensors and the input circuits.
- **CPU** (e.g. 1214C DC/DC/DC): holds the program memory and has 14 built-in digital inputs, 10 digital outputs and 2 analog inputs.
- **Digital inputs (DI)**: receive 0 V / 24 V signals from push buttons, switches and sensors.
- **Digital outputs (DQ)**: output 24 V to switch on lamps, valve solenoids and contactor coils.
- **Programming software** (in this course: PLC Studio, a simulated TIA Portal-style interface).`,
      },
      {
        title: '2. The scan cycle',
        body: `The PLC executes its program over and over in 3 steps; each pass is called a **scan cycle** (typically 1–10 ms):

1. **Read inputs**: copy the state of all inputs into the %I process image.
2. **Execute the program** from the first to the last network of OB1 (Main).
3. **Write outputs**: copy the %Q process image to the physical output terminals.

Important consequences: within one scan cycle the %I values **do not change**; if a coil is written twice, **the last write wins**. The scan time is shown at the top of the toolbar ("Scan … ms").`,
      },
      {
        title: '3. Addresses and the tag table',
        body: `| Area | Meaning | Example |
|---|---|---|
| %I | Input | %I0.5 = byte 0, bit 5 |
| %Q | Output | %Q0.2 |
| %M | Internal memory bit (Memory) | %M10.0 |
| %IW / %QW / %MW | 16-bit word | %IW64 (analog) |

Each byte has 8 bits numbered 0..7, so the address after %I0.7 is **%I1.0** (there is no %I0.8).

The **tag table (PLC tags)** gives addresses meaningful names: writing \`"S1"\` is easier to read than \`%I0.5\`. In this lab the tag table is already prepared — open **PLC tags → Tag table** to view it.`,
      },
      {
        title: '4. The three basic LAD elements',
        body: `| Symbol | Name | Conducts when |
|---|---|---|
| \`-| |-\` | Normally open contact (NO) | operand = 1 |
| \`-|/|-\` | Normally closed contact (NC) | operand = 0 |
| \`-( )-\` | Coil | — writes 1 if power flow reaches it, 0 otherwise |

### Series and parallel
- **Series = AND**: two contacts in series → the coil is energized only when both conduct.
- **Parallel = OR**: open a parallel branch → only one branch needs to conduct.

Turn on **Monitor**: paths with power flow are drawn as solid green lines, paths without power flow are dashed. This is the fastest way to find logic errors.`,
      },
      {
        title: '5. NO / NC push buttons — a common trap',
        body: `A contact **in the program** and the contact **of the real push button** are two different things.

- **NO** button (normally open): not pressed → input = 0; pressed → 1.
- **NC** button (normally closed): not pressed → input = **1**; pressed → **0**. Stop and Emergency stop buttons always use the NC type so that **a broken wire stops the machine** (fail-safe).

Therefore: to make "the buzzer sound when S3 (NC) is pressed", the LAD program must use a **normally closed** contact \`-|/|-\` for "S3". Conversely, for the NC Stop button we use a **normally open** contact "Stop" in series in the run circuit.`,
      },
      {
        title: '6. PNP and NPN sensors',
        body: `3-wire proximity/photoelectric sensors (brown +24 V, blue 0 V, black signal):

- **PNP (sourcing)**: when actuated, the black wire **outputs +24 V**.
- **NPN (sinking)**: when actuated, the black wire **pulls down to 0 V**.

S7-1200-style inputs are usually wired as **sinking** inputs: the common terminal 1M is connected to 0 V and the input expects +24 V → only **PNP** sensors can be used. If you connect an NPN sensor, the LED on the sensor body still lights up but the PLC does **not** receive the signal. Try the "Replace with NPN sensor" button on the trainer!

The through-beam photoelectric sensor is **Dark-On**: output = 1 when the beam is **blocked**.`,
      },
    ],
    quiz: [
      { q: 'Which address comes right after %I0.7?', options: ['%I0.8', '%I1.0', '%I1.7', '%IW1'], explain: 'Each byte has 8 bits (0..7); the next bit is bit 0 of byte 1.' },
      { q: 'S3 is an NC button. When it is NOT pressed, input %I0.7 equals?', options: ['0', '1', 'Undefined'], explain: 'A normally closed button conducts when not pressed → input = 1.' },
      { q: 'To light H2 when S1 and S2 are pressed at the same time, we connect the two NO contacts "S1", "S2"…', options: ['in parallel', 'in series', 'using NC contacts'], explain: 'A series connection corresponds to AND.' },
      { q: 'An NPN sensor wired to a sinking input (1M = 0 V)…', options: ['works normally', 'the PLC does not receive the signal', 'burns out the input'], explain: 'A sinking input needs +24 V supplied by the sensor (PNP).' },
    ],
  },

  L02: {
    outcomes: [
      'Draw and explain a Start/Stop seal-in circuit in LAD; compare it with Set/Reset instructions.',
      'Program forward/reverse control of a 3-phase motor with contactor interlocking and push-button interlocking.',
      'Use limit switches, a thermal overload relay and a safety sensor to stop the machine correctly.',
      'Recognize the short-circuit hazard when both reversing contactors close at the same time.',
    ],
    sections: [
      {
        title: '1. 3-phase motors and contactors',
        body: `A 3-phase induction motor is switched on and off by a **contactor**: the PLC outputs 24 V to coil A1–A2, and the main contacts connect the 380 V supply to the motor. Overload protection is provided by the **thermal overload relay F1**: when the motor is overloaded, the NC contact 95–96 of F1 opens.

**Reversing the direction of rotation**: swap 2 of the 3 phases. Two contactors are used: KM1 (forward: L1-L2-L3) and KM2 (reverse: L3-L2-L1). If KM1 and KM2 **close at the same time** → phase-to-phase short circuit, the circuit breaker trips and the contactors may burn out.`,
      },
      {
        title: '2. Seal-in (latching) circuit',
        body: `A push button only gives a signal while it is pressed. To keep the motor running after the button is released, we use a **contact of the coil itself** connected in parallel with the Start button:

| Network | Content |
|---|---|
| 1 | ( "S_Up" **in parallel with** "KM1" ) → "Stop" → … → ( "KM1" ) |

- Press S_Up → KM1 = 1 → contact "KM1" conducts → KM1 stays 1 after the button is released.
- Press Stop (NC) → input "Stop" = 0 → the circuit is broken → KM1 = 0.

Alternative: the **-(S)-** (Set) and **-(R)-** (Reset) instructions. The seal-in circuit is naturally "stop-dominant" and safe on power loss (no automatic restart).`,
      },
      {
        title: '3. Interlocking',
        body: `Two layers of interlocking for a reversing circuit:

1. **Contactor interlock**: put an NC contact "KM2" in series before coil "KM1", and an NC contact "KM1" before coil "KM2". While one contactor is closed, the other cannot close.
2. **Push-button interlock**: put NC "S_Down" in series in the KM1 circuit and NC "S_Up" in the KM2 circuit — if both buttons are pressed at once, neither contactor closes.

A real control cabinet also has a **mechanical interlock** between the two contactors. The PLC is only one layer of protection.

**Note**: reversing while the motor is still turning causes very high current and mechanical stress — stop for 0.5–1 s before reversing.`,
      },
      {
        title: '4. Limit switches and safety sensor',
        body: `- **LS_Up / LS_Down**: limit switches signalling that the door has reached its upper/lower limit. Put an NC contact "LS_Up" in series in the KM1 circuit so the motor stops by itself when the door is fully open. Otherwise the motor keeps pulling → overload → the thermal overload relay trips.
- **PE (door-edge sensor)**: if an obstacle is detected while the door is closing → stop immediately (many real doors also reopen).
- **F1 (thermal overload relay)**: an NC contact, F1 = 1 in normal operation. Put "F1" (NO contact) in series in both circuits, and turn on lamp H_Fault when F1 = 0.`,
      },
    ],
    quiz: [
      { q: 'In a seal-in circuit, how is contact "KM1" connected with button "S_Up"?', options: ['In series', 'In parallel', 'Not needed'], explain: 'In parallel: when the button is released, current flows through contact KM1 to hold the coil.' },
      { q: 'The Stop button on the control panel is NC. Which contact do we use for "Stop" in the run circuit?', options: ['Normally open -| |-', 'Normally closed -|/|-'], explain: 'Input Stop = 1 when not pressed, so a normally open contact conducts; pressing Stop → 0 → the circuit is broken.' },
      { q: 'What happens if KM1 and KM2 close at the same time?', options: ['The motor runs faster', 'Phase-to-phase short circuit', 'The motor stops safely'], explain: 'KM2 swaps 2 phases relative to KM1 → two phases are shorted directly through the contactors.' },
    ],
  },

  L03: {
    outcomes: [
      'Use the IEC timers TON, TOF, TP, TONR with an instance DB; read .Q and .ET.',
      'Explain the principle of the star-delta starter and how it reduces starting current.',
      'Program the star → delta changeover with a dead time and a KM2–KM3 interlock.',
      'Read analog values (%IW) and observe the current, speed and pressure trend chart.',
    ],
    sections: [
      {
        title: '1. IEC timers in the S7-1200',
        body: `| Timer | Operation | Application |
|---|---|---|
| **TON** (on-delay) | IN = 1 continuously for PT → Q = 1; IN = 0 → reset | On-delay: run in star for 4 s |
| **TOF** (off-delay) | IN = 0 for PT → Q = 0 | Fan keeps running after switch-off |
| **TP** (pulse) | Rising edge on IN → Q = 1 for exactly PT | Generate a fixed-length pulse |
| **TONR** | Like TON but **retentive (accumulating)**, reset with R | Machine running-hours counter |

Each timer needs an **instance DB** (e.g. \`"T_Star"\`) to remember the elapsed time. Read \`"T_Star".Q\` (has the time elapsed?) and \`"T_Star".ET\` (elapsed time). Time constants are written as \`T#4s\`, \`T#80ms\`, \`T#1m30s\`.`,
      },
      {
        title: '2. Why use a star-delta starter?',
        body: `With direct-on-line (DOL) starting, the motor draws **6–8 times rated current** for a few seconds → supply voltage dip, circuit breaker trips, mechanical shock.

Starting in **star (Y)**: each winding sees 380/√3 = 220 V → current and torque drop to **1/3**. When the motor reaches ~80–90 % speed, switch over to **delta (Δ)** to run at full power.

### The three contactors
| Contactor | Function |
|---|---|
| KM1 | Main supply (closed during the whole sequence) |
| KM2 | Star connection (winding ends joined together) |
| KM3 | Delta connection |

**KM2 and KM3 must never be closed at the same time** — 3-phase short circuit.`,
      },
      {
        title: '3. Control sequence',
        body: `1. Start → close KM1 + KM2 (star), start the TON for the star time (e.g. 4 s).
2. Star time elapsed → **open KM2**.
3. Wait for a **dead time** of 50–100 ms (a second TON) so the arc on the KM2 contacts is fully extinguished.
4. Close KM3 (delta). The motor runs normally.

Switching to delta **too early** (speed still low) → the current spikes almost as in a direct-on-line start. Waiting **too long** with both open → the motor slows down, which also causes a high current. Running in star too long (> 15 s) → overload.

Watch the **trend chart** below the 3D model: compare the current peak for a correct star-delta start with an attempt to switch straight to delta.`,
      },
      {
        title: '4. Pressure switch and analog signals',
        body: `- **PS** (pressure switch): = 1 when pressure is low (≤ 6 bar), switches back to 0 at 8 bar. The compressor starts/stops automatically according to PS in Auto mode.
- **P_Raw (%IW64)**: pressure sensor 0..10 bar ↔ digital value 0..27648.
- **I_Raw (%IW66)**: current transformer 0..200 A ↔ 0..27648.

Conversion formula: engineering value = Raw × Max / 27648. Example: P_Raw = 22118 → 22118 × 10 / 27648 ≈ 8.0 bar. (The NORM_X / SCALE_X instructions are covered in detail in Part 3.)`,
      },
    ],
    quiz: [
      { q: 'Compared with direct-on-line starting, star starting reduces the starting current to about?', options: ['1/2', '1/3', '1/√3', 'Unchanged'], explain: 'The phase voltage drops by √3 and the connection changes → line current drops by a factor of 3.' },
      { q: 'Which timer is suitable for timing the 4 s star run?', options: ['TON', 'TOF', 'TP'], explain: 'TON: Q goes to 1 after IN has been 1 continuously for PT.' },
      { q: 'Why is a dead time needed between KM2 opening and KM3 closing?', options: ['To make the motor run faster', 'To let the arc on KM2 extinguish and avoid a short circuit', 'It is not necessary'], explain: 'A contact that has just opened still carries an arc for a few tens of ms.' },
    ],
  },

  L04: {
    outcomes: [
      'Use the CTU, CTD, CTUD counters with an instance DB; read .Q and .CV; reset the counter.',
      'Use compare instructions (CMP) and MOVE to display values and make decisions based on numbers.',
      'Recognize rising/falling signal edges (P_TRIG, R_TRIG) and why they are needed when counting.',
      'Coordinate 2 conveyors using sensors to pack the right quantity.',
    ],
    sections: [
      {
        title: '1. IEC counters',
        body: `| Counter | Counts on | Q = 1 when |
|---|---|---|
| **CTU** (up-counter) | rising edge on CU | CV ≥ PV |
| **CTD** (down-counter) | rising edge on CD | CV ≤ 0 |
| **CTUD** (up/down) | CU / CD | QU: CV ≥ PV; QD: CV ≤ 0 |

- **CV**: current count value; **PV**: preset value (e.g. 12).
- **R** (reset, CTU/CTUD): sets CV to 0. **LD** (load, CTD): loads CV = PV.
- A counter only counts when its input **changes from 0 to 1** (rising edge); it does not keep counting while the signal stays at 1.

Like timers, each counter needs an instance DB, e.g. \`"C_Cans"\`.`,
      },
      {
        title: '2. Compare and MOVE',
        body: `- **Compare instructions** (contact form): \`==\`, \`<>\`, \`>\`, \`>=\`, \`<\`, \`<=\` — conduct when the comparison is true. Example: \`"C_Cans".CV >= 12\`.
- **MOVE**: when EN = 1, copies the value at IN to OUT1. Example: MOVE \`"C_Cans".CV\` → \`"Display"\` (%QW80) so the LED display shows the number of cans.

Data types must match: CV is an **Int** (16 bit), Display is an **Int** at %QW80.`,
      },
      {
        title: '3. Signal edges',
        body: `Many requirements call for reacting **once** when a signal changes, not for the whole time the signal = 1:

- \`-|P|-\` (rising edge): conducts for **exactly one scan cycle** when the operand changes 0 → 1. It needs its own memory bit to compare with the previous cycle.
- \`-|N|-\` (falling edge): when the operand changes 1 → 0.
- **R_TRIG / F_TRIG**: function-block form, with an instance.

Example in this lab: after the full case moves away, sensor B2 goes to 0, then back to 1 when a new empty case arrives → use the **rising edge of B2** to know that "a new case is in position".`,
      },
      {
        title: '4. Application: 12 cans per case',
        body: `1. A case is in position (B2 = 1) → run the can conveyor M1.
2. Each can falling through the chute makes B1 produce a pulse → the CTU counts.
3. CV = 12 (Q = 1) → **stop M1 immediately**, turn on lamp H_Full, run the case conveyor M2.
4. The full case leaves (B2 = 0), an empty case arrives (B2 = 1) → stop M2, **reset the counter**, restart M1.

Common mistakes: forgetting to stop M1 → cans fall when there is no case; resetting the counter at the wrong moment → cases with too few/too many cans.`,
      },
    ],
    quiz: [
      { q: 'When does a CTU increment CV?', options: ['Every scan cycle while CU = 1', 'When CU changes from 0 to 1', 'When R = 1'], explain: 'IEC counters count on the rising edge of CU.' },
      { q: 'Which instruction do you use to show the count on %QW80?', options: ['MOVE', 'CMP', 'TON'], explain: 'MOVE copies CV to Display.' },
      { q: 'How long does the "-|P|-" instruction conduct?', options: ['As long as the operand = 1', 'Exactly one scan cycle', '1 second'], explain: 'A rising-edge contact conducts for only one scan cycle.' },
    ],
  },

  /* ======================= PART 2 — CYLINDERS ======================= */
  L06: {
    outcomes: [
      'Program a multi-station sequence step by step using CASE or step memory bits.',
      'Control intermittent motion with a motor + position cam, using edge detection to stop exactly at each index.',
      'Interlocking: do not rotate the table while the locating pin or a cylinder is not retracted.',
      'Use a 1-bit shift register to carry the inspection result to the next station.',
    ],
    sections: [
      { title: '1. Indexing table', body: `The indexing table carries parts through several processing stations in turn. Each move rotates exactly 1 index (90°), then a **locating pin** locks the table so the stations can work accurately. The index position is signalled by a **cam + sensor IdxPos**.

Sequence for each index: pin in → the stations work (load, press, inspect, eject) → all cylinders retracted → pin out → rotate until IdxPos changes 0 → 1.` },
      { title: '2. Step-based programming', body: `Each step has **actions** (which outputs are on) and a **transition condition** (which sensor signals completion). Use a variable \`"Step"\` of type Int and a CASE statement (SCL), or step memory bits + Set/Reset (LAD).

It is good practice to separate the **step transitions** from the **outputs driven by each step** — easier to read and easier to debug.` },
      { title: '3. Shift register', body: `The inspection result is measured at station 2, but the part is ejected at station 3 one index later. The result must be **stored** and **shifted** along with the table: after each index, \`Good3 := Good2\`. This is the idea of a shift register, used very often in sorting conveyors.` },
    ],
  },
  L07: {
    outcomes: [
      'Read the symbols of a 5/2 single-solenoid valve, a double-acting cylinder and stroke sensors (reed switches).',
      'Program a sequence of 2 cylinders with sensor conditions.',
      'Explain the role of the clamp cylinder that holds the stack of parts in the magazine feeder.',
    ],
    sections: [
      { title: '1. Pneumatic cylinders and valves', body: `- **Double-acting cylinder**: air into the cap-end chamber → the rod extends; into the rod-end chamber → the rod retracts.
- **5/2 single-solenoid valve**: solenoid energized → cylinder extends; de-energized → the spring returns the valve, the cylinder retracts.
- **Reed switches nB1 / nB2** mounted on the cylinder body signal the retracted / extended position (named according to ISO 1219: cylinder 1A, valve 1V, solenoid 1Y1, sensors 1B1, 1B2).` },
      { title: '2. Gravity magazine feeder', body: `Parts are stacked in a tube. Cylinder 1A pushes the **bottom** part out onto the conveyor. Without holding, the second part is dragged along by friction → jam. Therefore cylinder 2A **clamps** the stack before pushing and releases it after 1A has retracted, so the stack drops down.

Sequence: 2A+ → 1A+ → 1A− → 2A− → wait for the drop.` },
    ],
  },
  L08: {
    outcomes: [
      'Program a case escapement using two staggered stops.',
      'Use the ready signal of the downstream machine to control the product flow.',
    ],
    sections: [
      { title: '1. Accumulation conveyor and escapement', body: `Cases queue up on a roller conveyor (accumulation). The downstream machine accepts **one case at a time**. Two staggered stops: stop 2 holds the first case, clamping stop 1 holds the second case. Release: clamp 1 → lower stop 2 → the first case leaves → raise stop 2 → release clamp 1.` },
      { title: '2. Release conditions', body: `Release only when the downstream machine is clear (B5 = 0). Wait until the case has **completely** passed before raising the stop, otherwise the stop hits the bottom of the case.` },
    ],
  },
  L09: {
    outcomes: [
      'Track product positions on a conveyor using a ring buffer (FIFO) and arrays.',
      'Make diverting decisions based on the product code; handle full lanes and unreadable codes.',
      'Control conveyor speed through an analog setpoint sent to the frequency inverter (VFD).',
    ],
    sections: [
      { title: '1. The lane-sorting problem', body: `The code reader at the start of the conveyor tells which lane a case belongs to, but the diverters are far downstream. While a case travels, other cases may already have entered → you **must not** use a single "current code" variable.` },
      { title: '2. Ring buffer (FIFO)', body: `Each case entering the conveyor (rising edge of B0) is given a sequence number, and its code is stored in the array \`Codes[n MOD 16]\`. Each diverter station has its own pointer, incremented when a case arrives; a downstream station skips cases already diverted by an earlier station.` },
      { title: '3. Conveyor speed', body: `M1_Speed (%QW80) = 0..27648 corresponds to 0..100 % of the VFD speed. Set 27648 to run at rated speed.` },
    ],
  },
  L10: {
    outcomes: [
      'Program a long sequence with many actuators (≥ 5 cylinders + vacuum).',
      'Distinguish single-solenoid and double-solenoid (bistable) valves; control them with pulses.',
      'Handle retries after a missed pick, with time monitoring of every step.',
    ],
    sections: [
      { title: '1. Case erector', body: `The suction arm picks a flat carton blank → the opening arm squares it into a box → the 2 bottom minor flaps are folded → the case is pushed through the major-flap folding rail and the bottom tape head.` },
      { title: '2. Double-solenoid valve', body: `A **double-solenoid** 5/2 valve remembers its last position: a single pulse on 1Y1 (advance) or 1Y2 (retract) is enough. On power loss the cylinder **holds** its position — suitable for mechanisms that must not retract by themselves when power is lost. Never energize both solenoids at the same time.` },
      { title: '3. Vacuum', body: `The ejector generates vacuum when supplied with compressed air. The vacuum switch VacOK signals that the carton blank has been picked. No VacOK within 1 s → treat it as a missed pick: retract the suction arm and try again, counting the number of retries.` },
    ],
  },
  L11A: {
    outcomes: [
      'Position products using a stop and a position sensor.',
      'Program the flap-folding order, lid holding and the interlock with the side drive belts.',
    ],
    sections: [
      { title: '1. Case sealer', body: `A filled case enters the machine and is stopped in the correct position. Two arms fold the top minor flaps, a hold-down plate keeps the lid closed, and the side drive belts carry the case through the major-flap folding rail and the tape head.` },
      { title: '2. Interlocking', body: `The side drive belts must not run while the folding arms are not retracted (the case would jam). The hold-down plate must be lowered before the case reaches the major-flap folding rail, otherwise the minor flaps spring back up.` },
    ],
  },
  L11B: {
    outcomes: [
      'Control a rodless cylinder with a 5/3 closed-centre valve (stopping in mid-stroke).',
      'Interlock the X axis and Z axis of the pick-and-place unit.',
      'Synchronize the pick-and-place unit with the tray conveyor using the step sensor.',
    ],
    sections: [
      { title: '1. 5/3 closed-centre valve', body: `A 5/3 valve has 3 positions: two solenoids drive the two directions; with **both solenoids off** → the valve returns to centre, blocking the air in both chambers → the cylinder stops where it is. Used for axes that must stop in mid-stroke or on power loss.` },
      { title: '2. Pick-and-place sequence', body: `Z down → vacuum on → Z up → X across → wait for an empty cell → Z down → release + blow-off → Z up → X back. **Never move X before Z is fully up.**` },
    ],
  },
  L18P: {
    outcomes: [
      'Design the sequence for a machine combining cylinders and a motor-driven lift table.',
      'Count rows/layers and manage the pallet cycle.',
      'Analyse and avoid collisions between the lift table and the layer layer plate.',
    ],
    sections: [
      { title: '1. Palletizer', body: `Group 2 cases into a row → push it onto the layer plate → 2 rows make a 2×2 layer → raise the pallet to the layer-receiving level → open the layer plate to drop the layer → lower the table by one layer → close the layer plate. After 3 layers: lower the table to the bottom and convey the pallet out.` },
      { title: '2. Collision analysis', body: `Before writing the program, list every pair of mechanisms that can collide (lift table ↔ layer plate, row pusher ↔ open layer plate…) and the safety condition for each motion.` },
    ],
  },
};
