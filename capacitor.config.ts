import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jonathanclark11.cinq",
  appName: "Cinqle",
  webDir: "dist/client",
  server: {
    url: "https://cinq.jonathanclark11.workers.dev",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
