// Extra module hooks for tests/app.test.mjs, registered after jsx-hooks.mjs so they win:
// - "react" resolves to react-app-stub.mjs, which adds useMemo/useSyncExternalStore on top of the base hook stub
// - game/useCinq.js resolves to useCinq-fake.mjs so a test can supply the game state App renders
const REACT = new URL('./react-app-stub.mjs', import.meta.url).href;
const FAKE_USE_CINQ = new URL('./useCinq-fake.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'react') return { url: REACT, shortCircuit: true };
  if (/game\/useCinq\.js$/.test(specifier)) return { url: FAKE_USE_CINQ, shortCircuit: true };
  return nextResolve(specifier, context);
}
