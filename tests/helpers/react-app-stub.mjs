// react-stub.mjs plus the extra hooks App.jsx uses. useSyncExternalStore returns the server snapshot while
// globalThis.__hydrating is true (the server render / first hydration pass), otherwise the client snapshot.
export * from './react-stub.mjs';
export { default } from './react-stub.mjs';

export const useMemo = (fn) => fn();
export const useCallback = (fn) => fn;
export function useSyncExternalStore(_subscribe, getSnapshot, getServerSnapshot) {
  return globalThis.__hydrating && getServerSnapshot ? getServerSnapshot() : getSnapshot();
}
