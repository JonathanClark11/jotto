import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jonathanclark11.jotto",
  appName: "Cinq",
  webDir: "dist/client",
  server: {
    url: "https://jotto.jonathanclark11.workers.dev",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
