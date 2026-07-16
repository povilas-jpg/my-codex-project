import { readFileSync } from "node:fs";
import { z } from "zod";
import type { PadConfig } from "../../shared/protocol.js";

const configSchema = z.object({
  autoSubmitVoice: z.boolean().default(true),
});

export function loadConfig(path?: string): PadConfig {
  if (!path) return configSchema.parse({});
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return configSchema.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load config ${path}: ${(err as Error).message}`);
  }
}
