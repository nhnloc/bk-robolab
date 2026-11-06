// Ô "Thuộc tính" cho phần tử LAD đang chọn (loại tiếp điểm/cuộn dây, toán hạng, tham số box…).
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { BOX_PINS, boxPins } from './ladSpec.js';
import * as M from './ladModel.js';

const KINDS = () => ({
  contact: [['NO', '-| |-  NO'], ['NC', '-|/|-  NC'], ['P', '-|P|-  ' + t('props.kRise')], ['N', '-|N|-  ' + t('props.kFall')], ['NOT', '-|NOT|-']],
  coil: [['=', '-( )-  ' + t('props.kAssign')], ['/', '-(/)-  ' + t('props.kNeg')], ['S', '-(S)-  Set'], ['R', '-(R)-  Reset'], ['P', '-(P)-'], ['N', '-(N)-']],
});

export function renderLadProps(ctx, sel) {
  if (!sel || !sel.node) return h('div.props-empty.muted', t('props.none'));
  const { net, path, node } = sel;
  const ro = ctx.readOnly;
  const blockName = ctx.state.sel?.block;
  const upd = (fn) => ctx.commit((p) => {
    const b = p.blocks.find((x) => x.name === blockName);
    const n = M.getNode(b.networks[net].rung, path);
    if (n) fn(n);
  });
  const fld = (label, input) => h('label.pf', h('span', label), input);
  const opIn = (val, on) => h('input.input.sm.mono', { value: val ?? '', list: 'bk-taglist', disabled: ro, spellcheck: 'false', onchange: (e) => on(e.target.value.trim()) });
  const sel2 = (opts, val, on) => h('select.select.sm', { disabled: ro, onchange: (e) => on(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
  const rows = [];
  const title = { contact: t('props.contact'), coil: t('props.coil'), cmp: t('props.cmp'), box: t('props.box') }[node.t] || node.t;
  if (node.t === 'contact' || node.t === 'coil') {
    rows.push(fld(t('props.kind'), sel2(KINDS()[node.t], node.kind, (v) => upd((n) => { n.kind = v; if (v === 'NOT') delete n.op; else n.op = n.op ?? ''; }))));
    if (node.kind !== 'NOT') rows.push(fld(t('props.operand'), opIn(node.op, (v) => upd((n) => { n.op = v; }))));
    if (node.t === 'contact' && (node.kind === 'P' || node.kind === 'N')) rows.push(fld(t('props.edgeMem'), opIn(node.mem, (v) => upd((n) => { if (v) n.mem = v; else delete n.mem; }))));
  } else if (node.t === 'cmp') {
    rows.push(fld(t('props.cmpOp'), sel2(['==', '<>', '>', '>=', '<', '<='].map((x) => [x, x]), node.op, (v) => upd((n) => { n.op = v; }))));
    rows.push(fld(t('props.type'), sel2(['Int', 'DInt', 'Real', 'Time'].map((x) => [x, x]), node.type, (v) => upd((n) => { n.type = v; }))));
    rows.push(fld('IN1', opIn(node.in1, (v) => upd((n) => { n.in1 = v; }))));
    rows.push(fld('IN2', opIn(node.in2, (v) => upd((n) => { n.in2 = v; }))));
  } else if (node.t === 'box') {
    const fns = Object.keys(BOX_PINS).filter((f) => f !== 'CALL');
    if (node.fn !== 'CALL') rows.push(fld(t('props.fn'), sel2(fns.map((f) => [f, f]), node.fn, (v) => upd((n) => { n.fn = v; const sp = BOX_PINS[v]; const keep = new Set([...sp.ins, ...sp.outs]); for (const k of Object.keys(n.params || {})) if (!keep.has(k)) delete n.params[k]; if (!sp.inst && !sp.bit) delete n.instance; else n.instance = n.instance ?? ''; }))));
    else rows.push(fld(t('props.block'), sel2(ctx.project.blocks.filter((b) => b.type === 'FC' || b.type === 'FB').map((b) => [b.name, `${b.name} (${b.type}${b.number})`]), node.block, (v) => upd((n) => { n.block = v; n.params = {}; }))));
    const spec = boxPins(node, ctx.project);
    if (spec.inst || spec.bit || node.instance !== undefined) rows.push(fld(spec.bit ? t('props.bitOperand') : t('props.instance'), opIn(node.instance, (v) => upd((n) => { n.instance = v; }))));
    for (const p of [...spec.ins, ...spec.outs.filter((o) => o !== spec.out || spec.outs[0] === spec.out)]) {
      rows.push(fld(p, opIn(node.params?.[p], (v) => upd((n) => { n.params = n.params || {}; if (v) n.params[p] = v; else delete n.params[p]; }))));
    }
  }
  return h('div.props', h('div.props-title', title, h('span.muted.small', ` · ${t('info.network')} ${net + 1} · ${t('props.path')} ${path}`)), h('div.props-grid', rows));
}
