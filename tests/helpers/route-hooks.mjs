// Lets node --test import the Next route handlers directly: maps the Workers-only
// "cloudflare:workers" module to a stub and resolves extensionless .ts imports.
import { registerHooks } from 'node:module';

const STUB = 'data:text/javascript,export const env = globalThis.__cinqTestEnv;';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: STUB, shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
