// English text for the labs in src/labs/index.js (Vietnamese is the source of truth).
// Arrays have the same order and length as the Vietnamese ones (SAFETY_TASKS are spread the same way).

const SAFETY_TASKS_EN = [
  'The Start button only works when the selector is in Auto and neither Stop nor Emergency stop is pressed.',
  'Pressing Stop or Emergency stop stops the machine immediately and switches off every valve and motor. Releasing Emergency stop must not restart the machine — Start has to be pressed again.',
  'Lamp H_Run is on while the machine runs in automatic mode; lamp H_Fault is on when a step stays stuck longer than its supervision time.',
];

export const LABS_EN = {
  L01: {
    title: 'Getting started with the PLC: I/O addresses and bit logic',
    objectives: [
      'Understand inputs %I, outputs %Q and the tag table',
      'Use normally open (NO) contacts, normally closed (NC) contacts and coils in LAD',
      'Combine contacts in series (AND) and in parallel (OR)',
      'Distinguish NO / NC push buttons and PNP / NPN sensors',
    ],
    tasks: [
      'H1 (red) lights when S1 is pressed.',
      'H2 (yellow) lights when S1 and S2 are pressed at the same time.',
      'H3 (green) lights when S2 is pressed OR selector switch SW1 is in the right position.',
      'Buzzer BUZ sounds when S3 is pressed. Note: S3 is a normally closed (NC) button — the input is 1 normally and 0 when pressed.',
      'H4 (blue) lights when proximity sensor PRX detects metal AND the beam of photoelectric sensor PE is NOT blocked.',
      'Experiment: click "Replace with NPN sensor", then move the metal target to the sensor — watch the LED on the sensor and input %I1.1. Explain why.',
    ],
    hints: [
      'NC button: to act "when pressed", use a normally closed contact -|/|- for tag S3.',
      'You can click the buttons either on the 3D model or on the 2D control panel.',
      'Turn on "Monitor" to see power flow through each contact.',
    ],
  },
  L02: {
    title: 'Seal-in and motor reversing circuits: roller shutter door',
    objectives: [
      'Start/Stop seal-in (latching) circuit in LAD',
      'Interlock between the 2 reversing contactors',
      'Use limit switches, a thermal overload relay and a safety sensor',
    ],
    tasks: [
      'Press Up (and release): KM1 closes and seals in, the door moves up; at the upper limit switch LS_Up, KM1 drops out. Lamp H_Up is on while the door moves up.',
      'Press Down: KM2 closes and seals in, the door moves down; at LS_Down, KM2 drops out. Lamp H_Down is on while the door moves down.',
      'The Stop button (normally closed) and Emergency stop stop the door at any position.',
      'Interlock: KM1 and KM2 must NEVER be closed at the same time, even when both buttons are pressed.',
      'While the door moves down and door-edge sensor PE reports an obstacle: stop immediately.',
      'When thermal overload relay F1 trips (F1 = 0): stop the motor and turn on lamp H_Fault.',
    ],
    hints: [
      'The Stop button on the panel is NC: input "Stop" = 1 when NOT pressed → use a normally open contact for "Stop".',
      'Interlock: put an NC contact of "KM2" in series before coil "KM1", and vice versa.',
    ],
  },
  L03: {
    title: 'IEC timers: star-delta starting of an air compressor',
    objectives: [
      'Use TON, TOF and TP timers with an instance DB',
      'Program a star-delta start with dead time at the changeover',
      'Read analog pressure and current signals; watch the starting-current trend',
    ],
    tasks: [
      'Press Start (selector in Auto): the machine becomes ready. When pressure switch PS = 1 (pressure low): close KM1 + KM2 (star).',
      'After 4 s in star: open KM2, wait 80 ms (dead time), then close KM3 (delta).',
      'When PS = 0 (8 bar reached): stop the motor (open KM1, KM3). When the pressure drops and PS = 1 again: restart star-delta automatically.',
      'KM2 and KM3 must never be closed at the same time.',
      'Stop / Emergency stop / thermal overload relay F1 tripped: stop immediately. If F1 trips, turn on H_Fault.',
      'Watch the trend: compare the starting current of a correct star-delta start with a direct start in delta.',
    ],
    hints: [
      'Use one TON for the star time and another TON (or TP) for the dead time.',
      'H_Run should be on while the machine is in automatic run mode, including when the motor is paused because the pressure is reached.',
    ],
  },
  L04: {
    title: 'Counters, compare and MOVE: 12 cans per case',
    objectives: [
      'Use CTU / CTUD counters with an instance DB',
      'Compare (CMP) values and MOVE a value to the display',
      'Coordinate two conveyors from sensor signals',
    ],
    tasks: [
      'Press Start: if a case is in position (B2 = 1), run product conveyor M1.',
      'Count the cans dropping into the case with sensor B1. Show the current count on the LED display (MOVE to "Display").',
      'After 12 cans: stop M1, turn on lamp H_Full, run case conveyor M2 until a new empty case arrives in position (B2 = 1), reset the counter and continue.',
      'No can may drop when there is no case, and no case may receive more than 12 cans.',
      'Stop / Emergency stop: stop both conveyors.',
    ],
    hints: [
      'B2 stays 1 while the full case is still standing: wait for B2 to go to 0 and back to 1 (new case) before continuing — use a rising edge.',
      'Is the 12th can still falling when you stop M1? Check it: stop M1 as soon as the count is reached.',
    ],
    sampleLabel: 'LED display shows the correct number of cans in the case being filled',
  },
  L06: {
    title: 'Indexing table: multi-station sequence',
    objectives: [
      'Control intermittent motion with a motor and a position cam',
      'Interlock: do not rotate the table while the locating pin or a cylinder is not home',
      'Use a 1-bit shift register to carry the inspection result from station 2 to station 3',
    ],
    tasks: [
      'Cycle for each index step: engage the locating pin → load a part (if the fixture is empty and the chute has parts) → press for 300 ms → read the inspection result → eject the part at station 3 into the OK or NG chute → retract the pin → rotate the table exactly 1 step.',
      'The table may only stop when cam IdxPos changes from 0 to 1 (detect the rising edge).',
      'The inspection result measured at station 2 must be "remembered" and used at station 3 one index step later.',
      ...SAFETY_TASKS_EN,
    ],
    hints: [
      'When the table stands at an index position, IdxPos = 1 right at the start: wait for IdxPos to go to 0 and back to 1 before stopping.',
      'HeightOK is only valid when P2 = 1.',
    ],
  },
  L07: {
    title: 'Gravity magazine feeder',
    objectives: [
      'Control 2 cylinders in a conditional sequence',
      'Understand the role of the clamp cylinder that holds the stack',
      'Use the magazine-low / magazine-empty sensors',
    ],
    tasks: [
      'Sequence: 2A clamps the stack → 1A pushes out the bottom workpiece → 1A retracts → 2A releases so the stack drops → wait 300 ms.',
      'Only push when there is a workpiece at the bottom of the magazine (B4) and the end of the conveyor is free (B5 = 0).',
      'The conveyor runs while the machine is in run mode.',
      ...SAFETY_TASKS_EN,
    ],
    hints: [
      'Pushing before 2A holds the stack: the second workpiece is dragged along and jams.',
    ],
  },
  L08: {
    title: 'Case escapement on an accumulation conveyor',
    objectives: [
      'Separate cases one at a time with two staggered stops',
      'Release condition from the downstream machine',
      'Avoid raising a stop into the bottom of a case',
    ],
    tasks: [
      'Normal state: stop 2 raised, holding the first case; stop 1 lowered.',
      'When a case is at stop 2 (B3) and the outfeed is free (B5 = 0): raise stop 1 → lower stop 2 → wait for the case to pass → raise stop 2 → lower stop 1.',
      'Never release 2 cases at the same time.',
      ...SAFETY_TASKS_EN,
    ],
    hints: [
      'Stop 1 is placed exactly one case length before stop 2.',
    ],
  },
  L09: {
    title: '3-lane case diverter',
    objectives: [
      'Track product positions on the conveyor with a ring buffer (FIFO)',
      'Decide which diverter fires from the product code',
      'Handle full lanes and cases with unreadable codes',
    ],
    tasks: [
      'The main conveyor runs at 100 % speed (M1_Speed = 27648) while the machine runs.',
      'The code reader at X = 300 gives the case code 1..3. A case with code n must go into lane n.',
      'Lane full (LnF = 1) or code not readable (Code = 0): let the case pass straight through to the reject lane at the end of the conveyor.',
      'Each divert: the cylinder extends fully (nB2) and then retracts.',
      ...SAFETY_TASKS_EN,
    ],
    hints: [
      'A case may reach diverter 3 after the next case has already passed diverter 1: do not use a single "current code" variable.',
      'Detect rising edges of B0, CodeValid and B1..B3 with R_TRIG.',
    ],
  },
  L10: {
    title: 'Case erector',
    objectives: [
      'Long multi-actuator sequence with double-solenoid valves and vacuum',
      'Retry after a missed pick',
      'Safety conditions: door, compressed air, magazine',
    ],
    tasks: [
      'Suction arm advances → vacuum on → wait for VacOK (after 1 s: retract and retry) → pull the blank back → opening arm squares the box → fold the 2 minor flaps → vacuum off → opening arm returns → push the case (retract the folders after 250 ms) → pusher retracts.',
      'Valves 1A and 5A are double-solenoid valves: a pulse is enough, but both solenoids must never be energised at the same time.',
      'Do not start a new cycle when the magazine is empty, the air is lost or the door is open. Turn on lamp H_Low when the carton blanks are running low.',
      ...SAFETY_TASKS_EN,
    ],
    hints: [
      'Releasing the vacuum before the box is fully open makes the blank spring back flat.',
      'Pushing the case while the vacuum is still on tears the case.',
    ],
  },
  L11A: {
    title: 'Case sealer (top flaps)',
    objectives: [
      'Position the case with a stop',
      'Flap folding order and holding the lid down',
      'Interlock between the flap folders and the drive belts',
    ],
    tasks: [
      'The infeed conveyor brings the case to the stop (BPos) → fold the front flap → fold the rear flap → lower the hold-down plate → retract both folders → lower the stop → run the drive belts until the case leaves (BOut) → raise the hold-down plate.',
      'Never run the drive belts while a flap folder is not retracted.',
      ...SAFETY_TASKS_EN,
    ],
    hints: [
      'The hold-down plate must be lowered before the case reaches the major-flap folding rail, otherwise the minor flaps spring up.',
    ],
  },
  L11B: {
    title: '2-axis pneumatic pick-and-place station',
    objectives: [
      '5/3 closed-centre valve and rodless cylinder',
      'X axis – Z axis interlock',
      'Synchronise with the tray conveyor using the step sensor',
    ],
    tasks: [
      'Z down → vacuum on → wait for VacOK → Z up → X to place position → wait for an empty tray cell (run the tray conveyor until BoxStep = 1) → Z down → release + blow-off for 150 ms → Z up → X back.',
      'Never move X while Z is not fully up.',
      ...SAFETY_TASKS_EN,
    ],
    hints: [
      '5/3 valve: with both solenoids off, the X axis stops where it is.',
    ],
  },
  L18P: {
    title: 'Project: pneumatic palletizer',
    objectives: [
      'Combine cylinders and a motor-driven lift table',
      'Count rows/layers and manage pallets',
      'Avoid collisions between the lift table and the layer plate',
    ],
    tasks: [
      'Collect 2 cases → push the row onto the layer plate. After 2 rows → raise the pallet to the layer-receiving level (LayerLvl) → open the layer plate to drop the layer → lower the lift table until LayerLvl → close the layer plate.',
      'After 3 layers: lower the table to the bottom, run the rollers to convey the pallet out, wait for a new pallet.',
      'Never close the layer plate while the stack is still higher than the plate.',
      ...SAFETY_TASKS_EN,
    ],
    hints: [
      'The infeed conveyor must stop while a row is being pushed.',
    ],
  },
};
