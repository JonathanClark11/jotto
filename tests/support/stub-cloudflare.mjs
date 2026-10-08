// Test-only loader hook: lets node import app/api/_shared/cinq-db.ts, which imports the Workers-only "cloudflare:workers".
import { register } from 'node:module';

const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {};', shortCircuit: true };
  return next(specifier, context);
}`;

register(`data:text/javascript,${encodeURIComponent(hooks)}`);
