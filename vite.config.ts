import vinext from "vinext";
import { defineConfig } from "vite";

const JOTTO_DB_ID = "2eddd625-7a7a-41e6-8748-f7836fff3d09";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [
    {
      binding: "DB",
      database_name: "jotto-db",
      database_id: JOTTO_DB_ID,
    },
  ],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      allowedHosts: ["jons-mac-mini.tail712946.ts.net"],
      hmr: {
        // HMR WebSocket must go through Tailscale Serve (port 3005),
        // not directly to the dev server (port 3006, which isn't externally accessible).
        host: "jons-mac-mini.tail712946.ts.net",
        port: 3005,
        protocol: "wss",
      },
    },
    define: {
      // workerd SSR environment doesn't expose WeakRef; polyfill for local dev.
      // Production workerd has native WeakRef; this shim is a strong ref,
      // which is safe for dev (no GC pressure, semantics are identical).
      WeakRef:
        "(globalThis.WeakRef ?? class WeakRef { constructor(t){this._t=t} deref(){return this._t} })",
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
