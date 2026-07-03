const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const node = process.execPath;

const steps = [
  {
    name: "public prelaunch",
    args: ["scripts/public-prelaunch-check.js"]
  },
  {
    name: "beta prelaunch",
    args: ["scripts/beta-prelaunch-check.js"]
  },
  {
    name: "postgres readiness",
    args: ["scripts/postgres-readiness-check.js"]
  },
  {
    name: "production config advisory",
    args: ["scripts/production-config-check.js"]
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
    console.error(`\nFinal release check failed at: ${step.name}`);
    process.exit(result.status || 1);
  }
}

console.log("\nFinal release check passed");
console.log("");
console.log("Next external checks before sharing widely:");
console.log("- Deploy with NODE_ENV=production and STORAGE_DRIVER=postgres.");
console.log("- Set PUBLIC_BASE_URL to the final https URL.");
console.log("- Set Discord OAuth redirect to PUBLIC_BASE_URL + /auth/discord/callback.");
console.log("- Export the first production backup from 管理.");
console.log("- Run LIVE_BASE_URL=https://YOUR-PUBLIC-URL npm run deploy:verify after deployment.");
console.log("- Run npm run config:check in the production environment before inviting testers.");
