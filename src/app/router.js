// Router theo hash: '#/lab/L07' → route '/lab/:id'.
import { Emitter } from './dom.js';

export class Router extends Emitter {
  constructor() {
    super();
    this.routes = [];
    window.addEventListener('hashchange', () => this.resolve());
  }
  add(pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([\w]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ pattern, re, keys, handler });
    return this;
  }
  get path() { return decodeURI((location.hash || '#/').slice(1)) || '/'; }
  go(path, { replace = false } = {}) {
    const hash = '#' + path;
    if (replace) { history.replaceState(null, '', hash); this.resolve(); }
    else if (location.hash === hash) this.resolve();
    else location.hash = hash;
  }
  resolve() {
    const path = this.path.split('?')[0];
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        this.emit('route', { path, params, route: r.pattern });
        r.handler(params, path);
        return;
      }
    }
    this.emit('notfound', { path });
  }
}

export const router = new Router();
