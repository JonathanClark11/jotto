// Stands in for src/game/useCinq.js: App renders whatever game state a test puts on globalThis.__cinq.
export function useCinq() {
  return globalThis.__cinq;
}
