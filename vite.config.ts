/// <reference types="vitest/config" />
// ビルドは2種類:
//   vite build                 → dist/        Web版（GitHub Pages）。サムネイルは dist/thumbs/ のファイル
//   vite build --mode single   → dist-single/ 単一HTML版。JS・CSS・データ・サムネイルをすべて1ファイルに埋め込む
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// カードデータは JSON → gzip → base64 で埋め込み、起動時に DecompressionStream で展開する（SPEC 5.5）
function embeddedData(single: boolean): Plugin {
  return {
    name: "pokepoke-embedded-data",
    resolveId(id) {
      if (id === "virtual:app-data" || id === "virtual:thumbs") return "\0" + id;
    },
    load(id) {
      if (id === "\0virtual:app-data") {
        const gz = gzipSync(readFileSync("src/data/app-data.json"), { level: 9 });
        return `export default ${JSON.stringify(gz.toString("base64"))};`;
      }
      if (id === "\0virtual:thumbs") {
        if (!single) return "export default null;";
        const dir = "public/thumbs";
        const map: Record<string, string> = {};
        for (const f of readdirSync(dir)) if (f.endsWith(".webp")) map[f.slice(0, -5)] = readFileSync(join(dir, f)).toString("base64");
        return `export default ${JSON.stringify(map)};`;
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: "./",
    plugins: [react(), tailwindcss(), embeddedData(single), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    publicDir: single ? false : "public",
    define: { __SINGLE__: JSON.stringify(single) },
    build: single
      ? { outDir: "dist-single", emptyOutDir: true, chunkSizeWarningLimit: 100000, assetsInlineLimit: 100000000 }
      : { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
    test: { include: ["src/**/*.test.ts"] },
  };
});
