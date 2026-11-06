import { PlcRuntime } from '../src/plc/runtime.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const fake = () => ({ def: { ioMap: { inputs: [{ addr: '%I0.0', tag: 'Start' }, { addr: '%I0.1', tag: 'Stop' }], outputs: [{ addr: '%Q0.2', tag: 'M' }, { addr: '%Q0.3', tag: 'L' }] } }, inputs: { Start: false, Stop: true }, outputs: {}, step() {} });
// 1. LAD seal-in + TON
const p1 = { tags: [{ name: 'Start', address: '%I0.0', type: 'Bool' }, { name: 'Stop', address: '%I0.1', type: 'Bool' }, { name: 'Motor', address: '%Q0.2', type: 'Bool' }, { name: 'Lamp', address: '%Q0.3', type: 'Bool' }],
  blocks: [{ name: 'Main', type: 'OB', number: 1, lang: 'LAD', networks: [
    { rung: { t: 'series', items: [{ t: 'parallel', branches: [{ t: 'contact', kind: 'NO', op: '"Start"' }, { t: 'contact', kind: 'NO', op: '"Motor"' }] }, { t: 'contact', kind: 'NO', op: '"Stop"' }, { t: 'coil', kind: '=', op: '"Motor"' }] } },
    { rung: { t: 'series', items: [{ t: 'contact', kind: 'NO', op: '"Motor"' }, { t: 'box', fn: 'TON', instance: '"T1"', params: { PT: 'T#2s' } }, { t: 'coil', op: '"Lamp"' }] } },
  ] }] };
const plc = new PlcRuntime(p1); const m = fake(); plc.attach(m);
ok(plc.load(p1).ok, 'compile LAD'); plc.start();
plc.runFor(50); ok(!m.outputs.M, 'motor off');
m.inputs.Start = true; plc.runFor(30); m.inputs.Start = false; plc.runFor(30); ok(m.outputs.M, 'seal-in');
plc.runFor(1500); ok(!m.outputs.L, 'TON not yet'); plc.runFor(600); ok(m.outputs.L, 'TON done');
ok(plc.read('"T1".ET') === 2000, 'ET=2000 ' + plc.read('"T1".ET'));
const pf = plc.getPowerFlow('Main', 0); ok(pf[''] === true && pf['0.1'] === true, 'power flow');
m.inputs.Stop = false; plc.runFor(30); ok(!m.outputs.M && !m.outputs.L, 'stop');
// 2. compile errors
const bad = JSON.parse(JSON.stringify(p1)); bad.blocks[0].networks[0].rung.items[1].op = '"Nope"';
const r = plc.compile(bad); ok(!r.ok && /Nope/.test(r.errors[0].message) && r.errors[0].network === 0, 'error msg: ' + r.errors[0]?.message);
// 3. SCL + FB with timer, FC, CASE, FOR, array
const p2 = { tags: [{ name: 'Start', address: '%I0.0', type: 'Bool' }, { name: 'Stop', address: '%I0.1', type: 'Bool' }, { name: 'Y', address: '%Q0.2', type: 'Bool' }, { name: 'Step', address: '%MW10', type: 'Int' }, { name: 'Sum', address: '%MD20', type: 'Real' }],
  blocks: [
    { name: 'FB_Cyl', type: 'FB', lang: 'SCL', interface: { Input: [{ name: 'Cmd', type: 'Bool' }], Output: [{ name: 'Done', type: 'Bool' }], Static: [{ name: 'T', type: 'TON' }, { name: 'Cnt', type: 'Int' }] },
      source: `#T(IN := #Cmd, PT := T#300ms);\n#Done := #T.Q;\nIF #Done THEN #Cnt := #Cnt + 1; END_IF;` },
    { name: 'FC_Avg', type: 'FC', lang: 'SCL', interface: { Input: [{ name: 'a', type: 'Real' }, { name: 'b', type: 'Real' }], Return: 'Real' }, source: 'FC_Avg := (#a + #b) / 2.0;' },
    { name: 'Data', type: 'DB', fields: [{ name: 'Arr', type: 'Array[0..4] of Int' }, { name: 'Cyl1', type: 'FB_Cyl' }] },
    { name: 'Main', type: 'OB', number: 1, lang: 'SCL', source: `
// state machine
CASE "Step" OF
  0: IF "Start" THEN "Step" := 10; END_IF;
  10: "Data".Cyl1(Cmd := TRUE);
      IF "Data".Cyl1.Done THEN "Step" := 20; END_IF;
  20, 30..40: "Y" := TRUE;
ELSE
  "Step" := 0;
END_CASE;
FOR #i := 0 TO 4 DO "Data".Arr[#i] := #i * 10; END_FOR;
"Sum" := "FC_Avg"(a := 1.0, b := INT_TO_REAL("Data".Arr[4]));
IF NOT "Stop" THEN "Step" := 0; "Y" := FALSE; END_IF;` },
  ] };
p2.blocks[3].interface = { Temp: [{ name: 'i', type: 'Int' }] };
// OB with temp: allow localTypes for OB? patch: OB uses {} → test should fail on #i
let r2 = plc.compile(p2); console.log('   OB temp:', r2.errors.map(e => e.message).join(' | '));
ok(r2.ok, 'compile SCL project');
const plc2 = new PlcRuntime(p2); const m2 = fake(); plc2.attach(m2); plc2.start();
plc2.runFor(50); ok(plc2.read('"Step"') === 0, 'step 0');
m2.inputs.Start = true; plc2.runFor(30); ok(plc2.read('"Step"') === 10, 'step 10');
plc2.runFor(400); ok(plc2.read('"Step"') === 20, 'FB timer -> step 20: ' + plc2.read('"Step"'));
plc2.runFor(30); ok(m2.outputs.M === true, 'Y on');
ok(plc2.read('"Data".Arr[3]') === 30, 'array FOR');
ok(Math.abs(plc2.read('"Sum"') - 20.5) < 1e-6, 'FC avg ' + plc2.read('"Sum"'));
ok(plc2.read('"Data".Cyl1.Cnt') > 0, 'FB static count ' + plc2.read('"Data".Cyl1.Cnt'));
m2.inputs.Stop = false; plc2.runFor(30); ok(m2.outputs.M === false, 'stop resets');
// runtime error → STOP with info
const p3 = { tags: [{ name: 'X', address: '%MW0', type: 'Int' }], blocks: [{ name: 'Main', type: 'OB', number: 1, lang: 'SCL', source: 'WHILE TRUE DO "X" := "X" + 1; END_WHILE;' }] };
const plc3 = new PlcRuntime(p3); let err; plc3.on('error', e => err = e); plc3.attach(fake()); plc3.start(); plc3.runFor(20);
ok(plc3.state === 'STOP' && err && err.line === 1, 'infinite loop -> STOP: ' + err?.message);
const p4 = { blocks: [{ name: 'Main', type: 'OB', number: 1, lang: 'SCL', source: 'IF TRUE THEN\n "x" := 1\nEND_IF' }] };
const r4 = new PlcRuntime().compile(p4); ok(!r4.ok, 'syntax err: ' + r4.errors.map(e => `L${e.line} ${e.message}`).join(';'));
process.exit(fail ? 1 : 0);
