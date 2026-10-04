// 元データを取得して data/raw/ に保存する。取得元のコミットSHAも記録する。
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAW = join(import.meta.dirname, "../data/raw");
mkdirSync(RAW, { recursive: true });

const sources = [
  {
    key: "pocketdecks",
    repo: "PocketDecks/pokemon-tcg-pocket-cards",
    branch: "main",
    files: {
      "pocketdecks.gameplay.json": "data/v5/cards.gameplay.json",
      "pocketdecks.cards.json": "data/v5/cards.json",
      "pocketdecks.expansions.json": "data/v5/expansions.json",
    },
  },
  {
    key: "flibustier",
    repo: "flibustier/pokemon-tcg-pocket-database",
    branch: "main",
    files: {
      "flibustier.cards.extra.json": "dist/cards.extra.json",
      "flibustier.sets.json": "dist/sets.json",
    },
  },
  {
    key: "pokeapi",
    repo: "PokeAPI/pokeapi",
    branch: "master",
    files: {
      "pokeapi.species_names.csv": "data/v2/csv/pokemon_species_names.csv",
      "pokeapi.languages.csv": "data/v2/csv/languages.csv",
    },
  },
] as const;

const record: Record<string, { repo: string; sha: string; fetchedAt: string }> = {};

for (const src of sources) {
  const sha = execSync(`git ls-remote https://github.com/${src.repo}.git refs/heads/${src.branch}`)
    .toString()
    .split(/\s/)[0];
  for (const [out, path] of Object.entries(src.files)) {
    const url = `https://raw.githubusercontent.com/${src.repo}/${sha}/${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    writeFileSync(join(RAW, out), Buffer.from(await res.arrayBuffer()));
    console.log(`✓ ${out}`);
  }
  record[src.key] = { repo: src.repo, sha, fetchedAt: new Date().toISOString() };
}

writeFileSync(join(RAW, "SOURCE.json"), JSON.stringify(record, null, 2));
console.log("SOURCE.json を更新しました");
