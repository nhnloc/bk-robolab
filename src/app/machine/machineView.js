// Khu "Máy": cảnh 3D (góc nhìn đặt sẵn) + bảng nút vận hành + bảng I/O.
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { trText } from '../loc.js';
import { split } from '../components/ui.js';
import { machineIo } from '../engine.js';
import { MachineViewer } from '../../scene/viewer.js';
import { Fallback2D } from '../../scene/fallback2d.js';
import { panelButtonForTag } from '../../scene/ioNodes.js';

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
import { createOperatorPanel } from './operatorPanel.js';
import { createIoPanel } from './ioPanel.js';
import { createTrend } from './readouts.js';

/** ioForced: Map đầu vào đang ép (do trang giữ) — để giữ trạng thái ép khi vẽ lại (đổi ngôn ngữ). */
export function createMachineView({ m, getPlc, allowOverride = false, readOnlyPanel = false, splitKey = 'machine-v', compact = false, ioForced }) {
  let lastVisual = null;
  const getVisual = () => lastVisual;
  const host = h('div.viewer-host');
  const badge = h('div.viewer-badge', { hidden: true }, t('mv.placeholder'));
  const crash = h('div.viewer-crash', { role: 'alert', hidden: true });
  const views = h('div.view-btns', { role: 'group', 'aria-label': t('mv.views') },
    ...[['iso', t('mv.iso')], ['front', t('mv.front')], ['side', t('mv.side')], ['top', t('mv.top')]].map(([id, l]) =>
      h('button.btn.sm', { type: 'button', onclick: () => viewer.setView(id) }, l)));
  const hlChip = h('div.hl-chip', { role: 'status', hidden: true });
  const stage = h('div.viewer-stage', host, views, badge, crash, hlChip, h('div.viewer-loading', t('mv.loading')));
  const ioList = machineIo(m.def);
  const inputTags = ioList.inputs.map((x) => x.tag);
  const opts = { machineId: m.def?.id || m.id, inputTags };
  let viewer;
  if (hasWebGL()) { try { viewer = new MachineViewer(host, opts); } catch (e) { console.info('[viewer] WebGL error, using the 2D diagram:', e?.message); viewer = null; } }
  if (!viewer) { host.replaceChildren(); viewer = new Fallback2D(host, opts); views.hidden = true; }
  viewer.setSource(() => { lastVisual = m.getVisual(); return lastVisual; });
  viewer.getOutputs = () => m.outputs;
  // Nút btn_<ID> trên mô hình 3D: nhấn nhả (momentary) hoặc mỗi click đảo trạng thái (latching/selector).
  if (!readOnlyPanel) viewer.setButtonHandler?.({
    press: (id, down) => { m.press(id, down); op.refresh(); },
    kindOf: (id) => m.def?.buttons?.find((b) => b.id === id)?.kind, // không có → viewer dùng `kind` trong manifest, rồi 'momentary'
    has: (id) => !!m.def?.buttons?.some((b) => b.id === id),
  });
  viewer.load().then(() => { stage.querySelector('.viewer-loading')?.remove(); badge.hidden = !viewer.isPlaceholder; }).catch((e) => console.warn(e));

  const op = createOperatorPanel({ m, getVisual, readOnly: readOnlyPanel });
  const io = createIoPanel({ m, getPlc, allowOverride, forced: ioForced, onLocate: (x, mode) => locate(x, mode) });

  /* ---- Chỉ vị trí thiết bị của một I/O trên mô hình: rê chuột (hover) hoặc bấm để ghim (pin) ---- */
  let hover = null, pinned = null, shown;
  function locate(x, mode = 'hover') {
    if (mode === 'pin') pinned = x && pinned?.addr !== x.addr ? x : null;
    else hover = x;
    const cur = hover || pinned;
    if (cur?.addr === shown?.addr && cur?.tag === shown?.tag) return;
    shown = cur;
    io.mark(cur?.addr);
    if (!cur) { viewer.highlight?.(null); op.highlight(null); hlChip.hidden = true; return; }
    const label = `${cur.addr} ${cur.tag}`;
    const n = viewer.highlight?.(cur.tag, label) || 0;
    const onPanel = op.highlight(cur.dir === 'I' ? panelButtonForTag(cur.tag, m.def?.buttons) : cur.tag);
    hlChip.replaceChildren(...[h('b.mono', label), cur.desc ? h('span', ' — ' + cur.desc) : null,
      !n ? h('span.muted', ' · ' + t(onPanel ? 'mv.hlPanel' : 'mv.hlNone')) : null].filter(Boolean));
    hlChip.hidden = false;
  }
  const bottom = h('div.mv-bottom', op.el, io.el);
  const trend = createTrend();
  const top = h('div.mv-top', stage, trend.el);
  const el = compact ? h('div.machine-view.compact', top, bottom) : h('div.machine-view', split({ dir: 'v', a: top, b: bottom, ratio: 0.6, min: 140, key: splitKey }));

  const timer = setInterval(() => {
    try { lastVisual = m.getVisual(); } catch (e) { /* giữ trạng thái cũ */ }
    op.refresh(); io.refresh();
    trend.update(lastVisual?.trend);
    const c = lastVisual?.crashed;
    crash.hidden = !c; if (c) crash.textContent = '⚠ ' + t('op.crashed') + ' ' + (trText(c.message) || '');
  }, 100);
  const onTheme = () => viewer.applyTheme();
  window.addEventListener('bk-theme', onTheme);

  return {
    el, viewer, getVisual, locate,
    clearForces: () => io.clearForces(),
    /** Chỉ vị trí theo tag (từ bảng I/O của phần hướng dẫn…). */
    locateTag(tag, mode) { const x = [...ioList.inputs, ...ioList.outputs].find((r) => r.tag === tag); locate(x || null, mode); },
    dispose() { clearInterval(timer); window.removeEventListener('bk-theme', onTheme); viewer.dispose(); },
  };
}
