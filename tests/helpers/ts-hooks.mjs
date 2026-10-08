// Module hooks so node --test can import the Worker route handlers (.ts) directly:
// - "cloudflare:workers" resolves to a stub whose env.DB is tests' globalThis.__TEST_ENV__.DB
// - extensionless relative imports resolve to .ts
// - .ts is transpiled with the repo's typescript devDependency (works on any supported Node)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const STUB = 'stub:cloudflare-workers';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: STUB, shortCircuit: true };
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === STUB) {
    return { format: 'module', shortCircuit: true, source: 'export const env = globalThis.__TEST_ENV__;' };
  }
  if (url.endsWith('.ts')) {
    const source = readFileSync(fileURLToPath(url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    return { format: 'module', shortCircuit: true, source: outputText };
  }
  return nextLoad(url, context);
}
