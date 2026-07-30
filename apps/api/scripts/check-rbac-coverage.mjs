import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const modulesDir = new URL("../src/modules", import.meta.url).pathname;
const ROUTE_START = /router\.(get|post|put|patch|delete)\(/;
const GUARDS = ["requirePermission(", "requirePermissionScoped(", "requireAuthenticated(", "requireRole("];

let failed = 0;

for (const mod of readdirSync(modulesDir)) {
  const routesPath = join(modulesDir, mod, "routes.ts");
  try {
    if (!statSync(routesPath).isFile()) continue;
  } catch {
    continue;
  }

  const content = readFileSync(routesPath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!ROUTE_START.test(line)) continue;

    // A route registration is one statement — collect only its own lines, stopping at the
    // closing `);`, so a later, unrelated route's requirePermission() can't count as coverage
    // for this one (the previous line+2-lookahead version had exactly that false-negative).
    let statement = "";
    let j = i;
    while (j < lines.length) {
      statement += lines[j] + "\n";
      if (/\);\s*$/.test(lines[j].trimEnd())) break;
      j++;
    }

    const precedingLine = lines[i - 1] ?? "";
    if (statement.includes("// public") || precedingLine.includes("// public")) continue;
    if (!GUARDS.some((g) => statement.includes(g))) {
      console.error(`FAIL: ${mod}/routes.ts:${i + 1} — route without an auth guard (${GUARDS.map((g) => g.slice(0, -1)).join("/")})`);
      console.error(`  ${line.trim()}`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} route(s) without an auth guard found.`);
  process.exit(1);
} else {
  console.log("OK: all routes have an auth guard.");
}
