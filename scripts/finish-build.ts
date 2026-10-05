// 単一HTML版（dist-single/index.html）を dist/pokepoke.html に置く。Web版からダウンロードできるようにする。
// あわせて、ソースコード一式を dist/source.zip に置く（カードデータが AGPL-3.0 なので、利用者がソースを受け取れるように）。
//   カード画像（public/cards-ja・thumbs・thumbs-ja）は scripts/images-ja.ts・thumbs.ts で作り直せるので入れない
import { execFileSync } from "node:child_process";
import { copyFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
copyFileSync(join(ROOT, "dist-single/index.html"), join(ROOT, "dist/pokepoke.html"));
rmSync(join(ROOT, "dist-single"), { recursive: true, force: true });
console.log(`dist/pokepoke.html ${(statSync(join(ROOT, "dist/pokepoke.html")).size / 1e6).toFixed(1)} MB`);

execFileSync("git", ["archive", "--format=zip", "--prefix=pokepoke-lab/", "-o", join(ROOT, "dist/source.zip"), "HEAD", "--", ".", ":!public/cards-ja", ":!public/thumbs", ":!public/thumbs-ja"], { cwd: ROOT });
console.log(`dist/source.zip ${(statSync(join(ROOT, "dist/source.zip")).size / 1e6).toFixed(1)} MB`);
