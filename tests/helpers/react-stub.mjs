// Minimal synchronous stand-in for the react hooks a component under test uses (useState, useEffect, useRef).
// mount(Component) renders it once, runs its effects, and re-renders on every state change.
let current = null;

export function useState(initial) {
  const h = current;
  const i = h.index++;
  if (!(i in h.slots)) h.slots[i] = { value: typeof initial === 'function' ? initial() : initial };
  const slot = h.slots[i];
  return [slot.value, (next) => {
    const value = typeof next === 'function' ? next(slot.value) : next;
    if (Object.is(value, slot.value)) return;
    slot.value = value;
    h.render();
  }];
}

export function useRef(initial) {
  const h = current;
  const i = h.index++;
  if (!(i in h.slots)) h.slots[i] = { current: initial };
  return h.slots[i];
}

export function useEffect(fn, deps) {
  const h = current;
  const i = h.index++;
  const slot = h.slots[i] ?? (h.slots[i] = {});
  const changed = !slot.deps || !deps || deps.some((d, j) => !Object.is(d, slot.deps[j]));
  if (changed) {
    slot.deps = deps;
    h.pending.push(() => { slot.cleanup?.(); slot.cleanup = fn(); });
  }
}

export function mount(Component) {
  const h = {
    slots: {}, index: 0, pending: [], tree: null,
    render() {
      const prev = current;
      current = h;
      h.index = 0;
      try { h.tree = Component(); } finally { current = prev; }
      const run = h.pending.splice(0);
      run.forEach((fn) => fn());
    },
    unmount() { Object.values(h.slots).forEach((s) => s.cleanup?.()); },
  };
  h.render();
  return h;
}

const react = { useState, useEffect, useRef };
export default react;
