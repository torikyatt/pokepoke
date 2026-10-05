// data/taxonomy.yaml の読み込み。tag.ts / validate.ts / build-index.ts で共有する
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";

export type EffectSlot = "attack" | "ability" | "trainer" | "tool";

export interface TagDef {
  id: string;
  ja: string;
  en?: string;
  parent?: string;
  match?: string[];
  exclude?: string[];
  on?: EffectSlot[];
  supplies?: string[];
  requires?: string[];
  children?: TagDef[];
}

export interface FlatTag extends Omit<TagDef, "children" | "match" | "exclude"> {
  depth: number;
  match: RegExp[];
  exclude: RegExp[];
}

export function loadTaxonomy(dataDir = join(import.meta.dirname, "../../data")): FlatTag[] {
  const root = loadYaml(readFileSync(join(dataDir, "taxonomy.yaml"), "utf8")) as TagDef[];
  const out: FlatTag[] = [];
  const walk = (defs: TagDef[], parent: string | undefined, depth: number) => {
    for (const d of defs) {
      if (depth > 3) throw new Error(`taxonomy: 4階層目のタグ ${d.id}`);
      if (parent && !d.id.startsWith(parent + ".")) throw new Error(`taxonomy: ${d.id} は ${parent} の下に置けない名前`);
      out.push({
        id: d.id, ja: d.ja, en: d.en, parent, depth, on: d.on, supplies: d.supplies, requires: d.requires,
        match: (d.match ?? []).map((s) => new RegExp(s)),
        exclude: (d.exclude ?? []).map((s) => new RegExp(s)),
      });
      walk(d.children ?? [], d.id, depth + 1);
    }
  };
  walk(root, undefined, 1);
  const ids = new Set<string>();
  for (const t of out) {
    if (ids.has(t.id)) throw new Error(`taxonomy: タグID重複 ${t.id}`);
    ids.add(t.id);
  }
  return out;
}
