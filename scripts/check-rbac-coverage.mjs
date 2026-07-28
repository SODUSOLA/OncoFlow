import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const modulesDir = new URL("../src/modules", import.meta.url).pathname;

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
    if (
      (line.includes(".get(") || line.includes(".post(") || line.includes(".put(") || line.includes(".patch(") || line.includes(".delete(")) &&
      !line.includes("requirePermission") &&
      !line.includes("// public")
    ) {
      const nextLine = lines[i + 1] ?? "";
      const nextNextLine = lines[i + 2] ?? "";
      const combined = line + nextLine + nextNextLine;
      if (!combined.includes("requirePermission")) {
        console.error(`FAIL: ${mod}/routes.ts:${i + 1} — route without requirePermission()`);
        console.error(`  ${line.trim()}`);
        failed++;
      }
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} route(s) without requirePermission() found.`);
  process.exit(1);
} else {
  console.log("OK: all routes have requirePermission() calls.");
}