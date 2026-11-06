// "Chạy thử mẫu": phát lại băng ghi (assets/demos/<lab>.json) — hình ảnh trạm khi chạy lời giải mẫu + nhật ký có chú thích.
// Chỉ có hình ảnh / sự kiện, không có chương trình lời giải. Bài làm của sinh viên không bị ảnh hưởng.
import { h } from '../dom.js';
import { icon } from '../components/icons.js';
import { MachineViewer } from '../../scene/viewer.js';
import { Robot2D } from '../../scene/robot2d.js';
import { TABLE_Z, TOOL } from '../../sim/layout.js';

let indexP = null;
/** { labId: { duration, frames, … } } — lab nào có băng ghi. */
export function demoIndex() {
  if (!indexP) indexP = fetch('assets/demos/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return indexP;
}
const LINKS = ['link_S', 'link_L', 'link_U', 'link_R', 'link_B', 'link_T'];
const fmt = (ms) => { const s = Math.max(0, ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
function hasWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }
/** Giá trị của danh sách thay đổi [[t, v], …] tại thời điểm t. */
function at(list, t) { let v = list[0]?.[1] ?? ''; for (const [ti, x] of list) { if (ti > t) break; v = x; } return v; }

export async function openDemo(labId) {
  const tape = await fetch(`assets/demos/${labId}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!tape) throw new Error('Chưa có bản chạy thử mẫu cho lab này');
  const F = tape.frames, dt = tape.frameMs;
  let t = 0, playing = true, speed = 1, lastNow = performance.now(), raf = 0;

  /* ---------------- dựng khung hình tại t ---------------- */
  const set = (s) => Object.fromEntries(String(s || '').split(' ').filter(Boolean).map((k) => [k, true]));
  function visualAt(time) {
    const i = Math.min(F.length - 1, Math.max(0, Math.floor(time / dt)));
    const a = F[i], b = F[Math.min(F.length - 1, i + 1)], u = Math.min(1, Math.max(0, (time - a.t) / dt));
    const parts = {};
    for (const [k, v] of Object.entries(a.p)) parts[k] = b.p[k] !== undefined ? v + (b.p[k] - v) * u : v;
    const nb = new Map(b.i.map((x) => [x[0], x]));
    const items = a.i.map(([id, x, y, z, rz, held]) => {
      const n = nb.get(id) || [id, x, y, z, rz]; const L = (p, q) => p + (q - p) * u;
      return { id, ...tape.statics[id], x: L(x, n[1]), y: L(y, n[2]), z: L(z, n[3]), rotZ: L(rz, n[4]), held: !!held };
    });
    const belts = a.b ? Object.fromEntries(Object.entries(a.b).map(([k, v]) => [k, v + ((b.b?.[k] ?? v) - v) * u])) : {};
    return { parts, items, outs: set(at(tape.outs, time)), leds: set(at(tape.leds, time)), belts, effects: [] };
  }
  let vis = visualAt(0);
  /** Trạm "ảo" cho sơ đồ 2D (máy không có WebGL). */
  const ghost = {
    get robot() { return { q: LINKS.map((k) => vis.parts[k] || 0), OT: [false, !!vis.outs.MAG], tool: TOOL }; },
    get items() { return vis.items.filter((it) => !/^(mk|fx|cam)\d*$/.test(it.id)).map((it) => ({ ...it, z: it.z - TABLE_Z })); },
    get mc() { return tape.cellId === 'mechatro' ? { axes: { A1: { phys: vis.parts.table_A || 0 }, B1: { phys: vis.parts.slide_B || 0 }, C1: { phys: vis.parts.slide_C || 0 } }, io: { outputs: { DO_05: !!vis.outs.MAG2 } } } : null; },
  };

  /* ---------------- giao diện ---------------- */
  const host = h('div.viewer-host');
  const stage = h('div.viewer-stage.demo-stage', host);
  let viewer = null;
  if (hasWebGL()) { try { viewer = new MachineViewer(host, { machineId: tape.model }); } catch { viewer = null; } }
  if (!viewer) { host.replaceChildren(); viewer = new Robot2D(host, { machineId: tape.cellId, cell: ghost }); }
  viewer.setSource(() => vis);
  viewer.getOutputs = () => vis.outs;
  viewer.load?.().catch(() => {});

  const statusEl = h('div.demo-status.mono.small');
  const noteEls = tape.notes.map(([nt, text, kind]) => h('li', { class: kind, onclick: () => seek(nt) }, h('span.mono', fmt(nt)), ' ', text));
  const noteList = h('ol.demo-notes', noteEls);
  const playBtn = h('button.btn', { type: 'button', onclick: () => { if (t >= tape.duration) t = 0; playing = !playing; upd(); } });
  const slider = h('input.demo-seek', { type: 'range', min: 0, max: tape.duration, step: dt, value: 0, oninput: (e) => seek(+e.target.value) });
  const timeEl = h('span.mono.small');
  const speedSel = h('select.input.sm', { onchange: (e) => { speed = +e.target.value; } }, [0.5, 1, 2, 4].map((s) => h('option', { value: s, selected: s === 1 }, `${s}×`)));
  const close = () => { cancelAnimationFrame(raf); viewer.dispose(); overlay.remove(); window.removeEventListener('keydown', onKey); };
  const overlay = h('div.demo-overlay', { role: 'dialog', 'aria-label': 'Chạy thử mẫu' },
    h('div.demo-box',
      h('div.demo-head', icon('film', { size: 16 }), h('b', `Chạy thử mẫu — ${tape.lab}: ${tape.title}`), h('span.spacer'),
        h('span.small.muted', 'Băng ghi trạm chạy lời giải mẫu (không có code). Bài làm của bạn không bị ảnh hưởng.'),
        h('button.btn.ghost.sm', { type: 'button', onclick: close, 'aria-label': 'Đóng' }, '✕')),
      h('div.demo-body', h('div.demo-left', stage, statusEl), h('div.demo-right', h('b.small', 'Diễn biến (bấm để tua tới)'), noteList)),
      h('div.demo-ctrl', playBtn, h('button.btn', { type: 'button', title: 'Chạy lại từ đầu', onclick: () => { seek(0); playing = true; upd(); } }, icon('reset', { size: 14 })), slider, timeEl, speedSel)));
  document.body.append(overlay);
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); playing = !playing; upd(); } };
  window.addEventListener('keydown', onKey);

  let lastIdx = -1;
  function seek(nt) { t = Math.max(0, Math.min(tape.duration, nt)); upd(); }
  function upd() {
    vis = visualAt(t);
    playBtn.replaceChildren(icon(playing ? 'stop' : 'play', { size: 14 }), playing ? ' Tạm dừng' : ' Chạy');
    slider.value = t; timeEl.textContent = `${fmt(t)} / ${fmt(tape.duration)}`;
    statusEl.textContent = at(tape.status, t);
    let idx = -1; tape.notes.forEach(([nt], i) => { if (nt <= t) idx = i; });
    if (idx !== lastIdx) {
      noteEls.forEach((el, i) => { el.classList.toggle('past', i <= idx); el.classList.toggle('cur', i === idx); });
      noteEls[idx]?.scrollIntoView({ block: 'nearest' }); lastIdx = idx;
    }
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const d = Math.min(100, now - lastNow); lastNow = now;
    if (playing) { t += d * speed; if (t >= tape.duration) { t = tape.duration; playing = false; } upd(); }
  }
  upd(); raf = requestAnimationFrame(loop);
  return { close };
}
