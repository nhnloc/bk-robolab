// Hiển thị số dạng LED 7 đoạn (đỏ trên nền đen) và đồ thị thời gian thực (canvas) cho getVisual().displays / .trend.
import { h, svg } from '../dom.js';
import { t } from '../i18n.js';
import { storage } from '../store.js';
import { trText } from '../loc.js';

/* ---------------- LED 7 đoạn ---------------- */
import { SEG, CHARS, formatSeg } from '../../scene/seg7.js';
export { formatSeg };

function digitEl() {
  const s = svg('svg', { viewBox: '0 0 24 40', class: 'seg-digit', 'aria-hidden': 'true' });
  const g = svg('g', { transform: 'skewX(-6) translate(3 0)' });
  const segs = {};
  for (const [k, [x, y, w, hh]] of Object.entries(SEG)) { segs[k] = svg('rect', { x, y, width: w, height: hh, rx: 1.2 }); g.appendChild(segs[k]); }
  const dp = svg('circle', { cx: 22.5, cy: 37.5, r: 1.7 });
  g.appendChild(dp); s.appendChild(g);
  return { el: s, set(ch, dot) { const on = CHARS[ch] ?? ''; for (const k in segs) segs[k].classList.toggle('on', on.includes(k)); dp.classList.toggle('on', !!dot); } };
}

export function createSegDisplay(d) {
  const n = Math.max(1, Math.min(8, +d.digits || 4));
  const digits = Array.from({ length: n }, digitEl);
  const val = h('span.seg-sr', { 'aria-live': 'off' });
  const unit = h('span.seg-unit');
  const lbl = h('span.seg-label');
  const el = h('div.seg-wrap', { title: trText(d.label) || d.id },
    h('div.seg-face', digits.map((x) => x.el), unit), lbl, val);
  let last = null;
  return {
    el,
    set(x) {
      const key = `${x.value}|${x.unit}|${x.label}`; if (key === last) return; last = key;
      formatSeg(x.value, n).forEach((c, i) => digits[i].set(c.ch, c.dot));
      const label = trText(x.label) || x.id || '', u = trText(x.unit) || '';
      unit.textContent = u; unit.hidden = !u;
      lbl.textContent = label;
      val.textContent = `${label}: ${x.value ?? ''} ${u}`;
    },
  };
}

/** Hàng bảng LED: tự tạo/xóa theo danh sách displays. */
export function createDisplayRow() {
  const el = h('div.seg-row', { hidden: true });
  const map = new Map();
  let sig = '';
  return {
    el,
    update(list) {
      list = Array.isArray(list) ? list : [];
      const s2 = list.map((d) => d.id + ':' + d.digits).join('|');
      if (s2 !== sig) {
        sig = s2; map.clear();
        el.replaceChildren(...list.map((d) => { const x = createSegDisplay(d); map.set(d.id, x); return x.el; }));
        el.hidden = !list.length;
      }
      for (const d of list) map.get(d.id)?.set(d);
    },
  };
}

/* ---------------- Đồ thị thời gian thực ---------------- */
const WINDOW = 600; // số điểm tối đa hiển thị

export function createTrend() {
  let open = storage.get('bk.trend.open', true);
  const legend = h('div.trend-legend');
  const toggle = h('button.btn.ghost.sm.trend-toggle', { type: 'button', 'aria-expanded': String(open), onclick: () => setOpen(!open) });
  const canvas = h('canvas.trend-canvas', { role: 'img', 'aria-label': t('trend.title') });
  const body = h('div.trend-body', canvas);
  const el = h('section.trend-strip', { hidden: true, 'aria-label': t('trend.title') },
    h('div.trend-head', h('b.trend-title', t('trend.title')), legend, h('span.spacer'), toggle), body);
  function setOpen(v) {
    open = v; storage.set('bk.trend.open', v);
    body.hidden = !v; el.classList.toggle('closed', !v);
    toggle.textContent = v ? '▾ ' + t('trend.hide') : '▸ ' + t('trend.show');
    toggle.setAttribute('aria-expanded', String(v));
    if (v && lastTrend) draw(lastTrend);
  }
  let lastTrend = null, legSig = '';
  setOpen(open);

  const chips = new Map();
  function updateLegend(tr) {
    const sig = tr.series.map((s) => s.id).join('|');
    if (sig !== legSig) {
      legSig = sig; chips.clear();
      legend.replaceChildren(...tr.series.map((s) => {
        const lb = trText(s.label) || s.id, u = trText(s.unit) || '';
        const v = h('b.mono'); const c = h('span.trend-chip', { title: `${lb} (0–${s.max} ${u})` },
          h('i', { style: { background: s.color } }), h('span', lb), v, h('span.muted', u));
        chips.set(s.id, v); return c;
      }));
    }
    for (const s of tr.series) {
      const last = s.data?.length ? s.data[s.data.length - 1] : null;
      const v = chips.get(s.id); if (!v) continue;
      v.textContent = last === null ? '—' : (Math.abs(last) >= 100 || Number.isInteger(last) ? Math.round(last) : (+last).toFixed(1));
    }
  }

  function draw(tr) {
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    if (!w || !hh) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(el);
    const col = (n, f) => cs.getPropertyValue(n).trim() || f;
    g.fillStyle = col('--panel-2', '#f5f7f9'); g.fillRect(0, 0, w, hh);
    const L = 34, R = 8, T = 6, B = 16;
    const pw = w - L - R, ph = hh - T - B;
    if (pw < 20 || ph < 20) return;
    // lưới + nhãn trục (theo % thang của từng đường; thang ghi ở chú thích)
    g.strokeStyle = col('--border', '#c9d0d8'); g.lineWidth = 1; g.fillStyle = col('--muted', '#5b6876'); g.font = '10px system-ui, sans-serif';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    const s0 = tr.series[0];
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(T + ph - (ph * i) / 4) + 0.5;
      g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
      if (s0) { const v = (s0.max * i) / 4; g.fillStyle = s0.color || col('--muted', '#5b6876'); g.fillText(v >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1), L - 4, y); }
    }
    const dt = +tr.dtMs || 100;
    const span = WINDOW * dt / 1000; // giây
    const step = span > 40 ? 10 : span > 15 ? 5 : 2;
    g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = col('--muted', '#5b6876');
    for (let s = 0; s <= span + 1e-6; s += step) {
      const x = Math.round(L + pw - (s / span) * pw) + 0.5;
      g.strokeStyle = col('--border', '#c9d0d8'); g.globalAlpha = 0.5; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.globalAlpha = 1;
      g.fillText(s === 0 ? '0 s' : `−${s}`, Math.min(Math.max(x, L + 10), L + pw - 8), T + ph + 3);
    }
    // đường
    g.save(); g.beginPath(); g.rect(L, T - 1, pw, ph + 2); g.clip();
    g.lineWidth = 1.8; g.lineJoin = 'round';
    for (const s of tr.series) {
      const data = s.data || []; const n = Math.min(data.length, WINDOW);
      if (n < 2) continue;
      const max = +s.max || Math.max(1, ...data);
      g.strokeStyle = s.color || '#2a86c9'; g.beginPath();
      for (let i = 0; i < n; i++) {
        const v = +data[data.length - n + i] || 0;
        const x = L + pw - ((n - 1 - i) / (WINDOW - 1)) * pw;
        const y = T + ph - Math.max(-0.02, Math.min(1.02, v / max)) * ph;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }

  return {
    el,
    update(tr) {
      const ok = tr && Array.isArray(tr.series) && tr.series.length;
      el.hidden = !ok;
      if (!ok) return;
      lastTrend = tr;
      updateLegend(tr);
      if (open) draw(tr);
    },
  };
}
