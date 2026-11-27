// Generate workers/src/fixtures.json from the deterministic fixture generator.
// Usage: node workers/scripts/gen-fixtures.mjs   (run `npm run build:workers` first)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateFixtures, fixtureSummary } from "../dist/fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = generateFixtures();
writeFileSync(join(root, "src", "fixtures.json"), JSON.stringify({ generated: new Date().toISOString(), summary: fixtureSummary(fixtures), fixtures }, null, 2) + "\n");
console.log(JSON.stringify(fixtureSummary(fixtures), null, 2));
console.log(`Wrote ${fixtures.length} fixtures to workers/src/fixtures.json`);
