// English text for simulated machines (robot stations not translated yet).
// Vietnamese in the machine defs is the source of truth; entries here are keyed by tag / button id / fault id.

/** Operator panel shared by every machine (PANEL_INPUTS, PANEL_OUTPUTS, PANEL_BUTTONS, base faults). */
export const PANEL_EN = {
  io: {
    Start: 'Start push button (NO)',
    Stop: 'Stop push button (NC — normally = 1)',
    Reset: 'Fault reset push button (NO)',
    EStop: 'Emergency stop (NC — normally = 1)',
    AutoMan: 'Mode selector switch (1 = Auto, 0 = Manual)',
    H_Run: 'Run lamp (green)',
    H_Fault: 'Fault lamp (red)',
  },
  buttons: {
    Start: 'Start',
    Stop: 'Stop',
    Reset: 'Reset',
    EStop: 'Emergency stop',
    AutoMan: 'Auto / Man',
  },
  faults: {
    noAir: 'Compressed air supply lost',
  },
};

/** Standard cylinder faults from Machine.cylFaults(keys): id `cyl_<key>_<kind>`. */
export const CYL_FAULTS_EN = {
  stuck: (k) => `Cylinder ${k} jammed`,
  slow: (k) => `Cylinder ${k} too slow (flow control misadjusted)`,
  b2: (k) => `Sensor ${k.replace('A', 'B2')} faulty`,
};

export const MACHINES_EN = {};
