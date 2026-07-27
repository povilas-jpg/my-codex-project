import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "server/src/**/*.test.ts",
      "shared/**/*.test.ts",
      "bridge/src/**/*.test.ts",
    ],
    environment: "node",
  },
});
