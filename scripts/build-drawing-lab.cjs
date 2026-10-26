const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--config",
    "vite.drawing-lab.config.mjs",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
fs.copyFileSync(".drawing-lab-build/drawing-lab.html", "dist/drawing-lab.html");
