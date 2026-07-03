const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const node = process.execPath;

const steps = [
  {
    name: "syntax",
    args: [
      "--check",
      "server.js"
    ]
  },
  {
    name: "frontend syntax",
    args: [
      "--check",
      "public/app.js"
    ]
  },
  {
    name: "preflight",
    args: [
      "scripts/preflight-check.js"
    ]
  },
  {
    name: "public readiness",
    args: [
      "scripts/public-readiness-check.js"
    ]
  },
  {
    name: "smoke",
    args: [
      "scripts/smoke-test.js"
    ]
  }
];

for (const step of steps) {
  console.log(`\n== ${step.name} ==`);
  const result = spawnSync(node, step.args, {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error(`\nPublic prelaunch failed at: ${step.name}`);
    process.exit(result.status || 1);
  }
}

console.log("\nPublic prelaunch checks passed");
