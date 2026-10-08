// Test-only loader hook: lets node import app/api/** routes, which import the Workers-only "cloudflare:workers"
// and use extensionless relative imports that resolve to .ts files.
import { register } from 'node:module';

const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {};', shortCircuit: true };
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) return next(specifier + '.ts', context);
    throw error;
  }
}`;

register(`data:text/javascript,${encodeURIComponent(hooks)}`);
