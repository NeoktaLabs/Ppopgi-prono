import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const archivePath = resolve("public/hall-of-fame/world-cup-2026.json");
const archive = JSON.parse(readFileSync(archivePath, "utf8"));
const competition = archive?.competitions?.[0];
const rankings = competition?.rankings ?? [];
const matches = competition?.matches ?? [];

if (rankings.length === 0 || matches.length === 0) {
  console.error(
    [
      "Hall of Fame archive is empty.",
      "Run `npm run hall-of-fame:export` while authenticated with Wrangler before deploying.",
      `Checked: ${archivePath}`,
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`Hall of Fame archive ready: ${rankings.length} players, ${matches.length} matches.`);
