import { describe, it, expect, beforeEach } from 'vitest';
import { wireProseEditing } from './reportEditing.js';

// Minimal DOM stub — enough of the element API for wireProseEditing to run in
// plain Node (the test env has no jsdom). Elements live under a single root so
// nextElementSibling can be derived from the parent's child order.
class El {
  constructor(tag, text = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.textContent = text;
    this.className = className;
    this.children = [];
    this.parentNode = null;
    this.type = '';
    this.title = '';
    this._focused = false;
    this._ce = undefined;
    this.style = new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : ''),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  }
  get classList() {
    const self = this;
    return { contains: (c) => self.className.split(/\s+/).filter(Boolean).includes(c) };
  }
  set contentEditable(v) { this._ce = v; }
  get contentEditable() { return this._ce; }
  get isContentEditable() { return this._ce === 'true'; }
  get firstChild() { return this.children[0] || null; }
  get nextElementSibling() {
    const sibs = this.parentNode?.children;
    if (!sibs) return null;
    const i = sibs.indexOf(this);
    return i >= 0 && i + 1 < sibs.length ? sibs[i + 1] : null;
  }
  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode._detach(node);
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i >= 0) this.children.splice(i, 0, node); else this.children.push(node);
    node.parentNode = this;
    return node;
  }
  appendChild(node) {
    if (node.parentNode) node.parentNode._detach(node);
    this.children.push(node);
    node.parentNode = this;
    return node;
  }
  _detach(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
  }
  querySelector(sel) {
    if (sel !== 'button') throw new Error('stub only supports button');
    for (const c of this.children) {
      if (c.tagName === 'BUTTON') return c;
      const d = c.querySelector('button');
      if (d) return d;
    }
    return null;
  }
  focus() { this._focused = true; }
}

function makeDoc(root) {
  return {
    createElement: (tag) => new El(tag),
    querySelectorAll: (sel) => {
      if (sel !== 'h2') throw new Error('stub only supports h2');
      const out = [];
      (function walk(n) { for (const c of n.children) { if (c.tagName === 'H2') out.push(c); walk(c); } })(root);
      return out;
    },
  };
}

function build(sections) {
  // sections: [{ heading, prose: 'bare' | 'wrapped' | 'none', preButton?: bool }]
  const root = new El('body');
  for (const s of sections) {
    const h = new El('h2', s.heading);
    if (s.preButton) h.appendChild(new El('button'));
    root.appendChild(h);
    if (s.prose === 'bare') {
      root.appendChild(new El('p', 'Para one.'));
      root.appendChild(new El('p', 'Para two.'));
    } else if (s.prose === 'wrapped') {
      const box = new El('div', '', 'editable-prose');
      box.appendChild(new El('p', 'Para one.'));
      root.appendChild(box);
    } else if (s.prose === 'card') {
      root.appendChild(new El('div', 'a metric card', 'card'));
    }
  }
  return root;
}

describe('wireProseEditing', () => {
  it('adds an edit toggle to narrative sections but not data sections', () => {
    const root = build([
      { heading: 'Executive Summary', prose: 'bare' },
      { heading: 'Period Snapshot', prose: 'card' },
      { heading: 'Key Insights', prose: 'bare' },
    ]);
    wireProseEditing(makeDoc(root));

    const [exec, snapshot, insights] = root.children.filter(c => c.tagName === 'H2');
    expect(exec.querySelector('button')).toBeTruthy();
    expect(insights.querySelector('button')).toBeTruthy();
    expect(snapshot.querySelector('button')).toBeNull(); // data section stays locked
  });

  it('wraps a run of bare <p> tags in a .swanky-editable box', () => {
    const root = build([{ heading: 'Key Insights', prose: 'bare' }]);
    wireProseEditing(makeDoc(root));
    const box = root.children.find(c => c.className === 'swanky-editable');
    expect(box).toBeTruthy();
    expect(box.children.filter(c => c.tagName === 'P')).toHaveLength(2);
  });

  it('reuses an existing .editable-prose wrapper instead of double-wrapping', () => {
    const root = build([{ heading: 'Comparison Analysis', prose: 'wrapped' }]);
    wireProseEditing(makeDoc(root));
    expect(root.children.filter(c => c.className === 'swanky-editable')).toHaveLength(0);
    const h = root.children.find(c => c.tagName === 'H2');
    expect(h.querySelector('button')).toBeTruthy();
  });

  it('toggles contentEditable and the glyph on click', () => {
    const root = build([{ heading: 'Executive Summary', prose: 'bare' }]);
    wireProseEditing(makeDoc(root));
    const h = root.children.find(c => c.tagName === 'H2');
    const btn = h.querySelector('button');
    const box = root.children.find(c => c.className === 'swanky-editable');

    expect(btn.textContent).toBe('✎');
    expect(box.isContentEditable).toBe(false);

    btn.onclick();
    expect(box.isContentEditable).toBe(true);
    expect(btn.textContent).toBe('✓');
    expect(box._focused).toBe(true);
    expect(box.style.outline).toBe('1px dashed #ccc');

    btn.onclick();
    expect(box.isContentEditable).toBe(false);
    expect(btn.textContent).toBe('✎');
    expect(box.style.outline).toBe('');
  });

  it('skips a heading that is already wired (avoids double controls)', () => {
    const root = build([{ heading: 'Key Insights', prose: 'bare', preButton: true }]);
    wireProseEditing(makeDoc(root));
    const h = root.children.find(c => c.tagName === 'H2');
    expect(h.children.filter(c => c.tagName === 'BUTTON')).toHaveLength(1);
    expect(root.children.some(c => c.className === 'swanky-editable')).toBe(false);
  });
});
