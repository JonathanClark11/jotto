import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

// worker/index.ts imports vinext server modules that need the vinext build runtime. Replace them with stubs that
// record calls on globalThis so the routing in the Worker can be asserted in isolation.
const stubs = {
  'vinext/server/image-optimization': `
    export const DEFAULT_DEVICE_SIZES = [640, 750];
    export const DEFAULT_IMAGE_SIZES = [16, 32];
    export async function handleImageOptimization(request, deps, allowedWidths) {
      globalThis.__workerStub.image.push({ request, deps, allowedWidths });
      return new Response('image-stub', { status: 200 });
    }`,
  'vinext/server/app-router-entry': `
    export default {
      async fetch(request, env, ctx) {
        globalThis.__workerStub.handler.push({ request, env, ctx });
        return new Response('handler-stub', { status: 200 });
      },
    };`,
};

const hooks = `
const stubs = ${JSON.stringify(stubs)};
export async function resolve(specifier, context, next) {
  if (specifier in stubs) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
  return next(specifier, context);
}`;
globalThis.__workerStub = { image: [], handler: [] };
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { default: worker } = await import('../worker/index.ts');
const { AASA } = await import('../worker/aasa.ts');

const AASA_PATH = '/.well-known/apple-app-site-association';
const makeEnv = () => ({ ASSETS: { fetch: async (req) => new Response(`asset:${req.url}`) }, DB: {}, IMAGES: {} });
const makeCtx = () => ({ waitUntil() {}, passThroughOnException() {} });

test.beforeEach(() => {
  globalThis.__workerStub.image.length = 0;
  globalThis.__workerStub.handler.length = 0;
});

test('AASA path returns 200 JSON equal to AASA with a one hour cache header', async () => {
  const res = await worker.fetch(new Request(`https://jotto.example${AASA_PATH}`), makeEnv(), makeCtx());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^application\/json/);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=3600');
  assert.deepEqual(await res.json(), AASA);
});

test('AASA path is not forwarded to the vinext handler or image optimizer', async () => {
  await worker.fetch(new Request(`https://jotto.example${AASA_PATH}`), makeEnv(), makeCtx());
  assert.equal(globalThis.__workerStub.handler.length, 0);
  assert.equal(globalThis.__workerStub.image.length, 0);
});

test('AASA path ignores the query string when matching', async () => {
  const res = await worker.fetch(new Request(`https://jotto.example${AASA_PATH}?x=1`), makeEnv(), makeCtx());
  assert.deepEqual(await res.json(), AASA);
  assert.equal(globalThis.__workerStub.handler.length, 0);
});

test('/_vinext/image invokes the image handler with the allowed widths', async () => {
  const request = new Request('https://jotto.example/_vinext/image?url=%2Fa.png&w=640&q=75');
  const res = await worker.fetch(request, makeEnv(), makeCtx());
  assert.equal(await res.text(), 'image-stub');
  assert.equal(globalThis.__workerStub.handler.length, 0);
  const [call] = globalThis.__workerStub.image;
  assert.equal(call.request, request);
  assert.deepEqual(call.allowedWidths, [640, 750, 16, 32]);
});

test('image handler fetchAsset reads from ASSETS, resolved against the request URL', async () => {
  const request = new Request('https://jotto.example/_vinext/image?url=%2Fa.png&w=640');
  await worker.fetch(request, makeEnv(), makeCtx());
  const { deps } = globalThis.__workerStub.image[0];
  const res = await deps.fetchAsset('/a.png');
  assert.equal(await res.text(), 'asset:https://jotto.example/a.png');
});

test('image handler transformImage uses IMAGES binding, omitting width when 0', async () => {
  const calls = [];
  const env = makeEnv();
  env.IMAGES = {
    input(body) {
      calls.push({ body });
      return {
        transform(opts) {
          calls.push({ transform: opts });
          return { output: async (o) => (calls.push({ output: o }), { response: () => new Response('img') }) };
        },
      };
    },
  };
  await worker.fetch(new Request('https://jotto.example/_vinext/image'), env, makeCtx());
  const { deps } = globalThis.__workerStub.image[0];
  const body = new ReadableStream();
  const res = await deps.transformImage(body, { width: 640, format: 'image/webp', quality: 75 });
  assert.equal(await res.text(), 'img');
  await deps.transformImage(body, { width: 0, format: 'image/avif', quality: 60 });
  assert.equal(calls[0].body, body);
  assert.deepEqual(calls[1].transform, { width: 640 });
  assert.deepEqual(calls[2].output, { format: 'image/webp', quality: 75 });
  assert.deepEqual(calls[4].transform, {});
  assert.deepEqual(calls[5].output, { format: 'image/avif', quality: 60 });
});

for (const path of ['/', '/api/players', '/_vinext/image/extra', '/.well-known/other']) {
  test(`${path} falls through to handler.fetch with the same request, env and ctx`, async () => {
    const request = new Request(`https://jotto.example${path}`);
    const env = makeEnv();
    const ctx = makeCtx();
    const res = await worker.fetch(request, env, ctx);
    assert.equal(await res.text(), 'handler-stub');
    assert.equal(globalThis.__workerStub.image.length, 0);
    const [call] = globalThis.__workerStub.handler;
    assert.equal(call.request, request);
    assert.equal(call.env, env);
    assert.equal(call.ctx, ctx);
  });
}
