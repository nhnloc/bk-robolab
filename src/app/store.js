// Lưu trữ cục bộ an toàn (localStorage có thể bị chặn) + cài đặt giao diện.
import { Emitter } from './dom.js';

const mem = new Map();
export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch { /* bị chặn hoặc hỏng */ }
    return mem.has(key) ? mem.get(key) : fallback;
  },
  set(key, value) {
    mem.set(key, value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua */ }
  },
  remove(key) {
    mem.delete(key);
    try { localStorage.removeItem(key); } catch { /* bỏ qua */ }
  },
};

export const settings = new (class extends Emitter {
  get theme() { try { return localStorage.getItem('bk.theme') || 'light'; } catch { return mem.get('bk.theme') || 'light'; } }
  set theme(v) {
    mem.set('bk.theme', v);
    try { localStorage.setItem('bk.theme', v); } catch { /* bỏ qua */ }
    document.documentElement.dataset.theme = v;
    this.emit('theme', v);
  }
  get lang() { return storage.get('bk.lang', 'vi'); }
  set lang(v) { storage.set('bk.lang', v); this.emit('lang', v); }
})();

export function applyTheme() { document.documentElement.dataset.theme = settings.theme; }
