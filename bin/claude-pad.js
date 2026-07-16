#!/usr/bin/env node
import("../dist/server/src/index.js").catch((err) => {
  console.error(
    "claude-pad: build output missing — run `npm run build` first.\n",
    err.message,
  );
  process.exit(1);
});
