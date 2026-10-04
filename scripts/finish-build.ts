// 単一HTML版（dist-single/index.html）を dist/pokepoke.html に置く。Web版からダウンロードできるようにする
import { copyFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
copyFileSync(join(ROOT, "dist-single/index.html"), join(ROOT, "dist/pokepoke.html"));
rmSync(join(ROOT, "dist-single"), { recursive: true, force: true });
console.log(`dist/pokepoke.html ${(statSync(join(ROOT, "dist/pokepoke.html")).size / 1e6).toFixed(1)} MB`);
