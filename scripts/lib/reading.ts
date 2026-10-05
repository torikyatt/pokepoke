// 漢字を含む名前・表現のよみ（ひらがな）。ローマ字検索（hakase → 博士の研究）に使う。kuromoji の辞書で読み、
// 固有の読み方（行商人・釣り人・山札など）は先に置き換える
import kuromoji from "kuromoji";
import { join } from "node:path";

const OVERRIDE: [string, string][] = [
  ["行商人", "ぎょうしょうにん"], ["釣り人", "つりびと"], ["山札", "やまふだ"], ["手札", "てふだ"], ["弱点", "じゃくてん"],
  ["特性", "とくせい"], ["博士", "はかせ"], ["化石", "かせき"], ["団", "だん"],
];
const kata2hira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export async function createReader(): Promise<(s: string) => string> {
  const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((res, rej) =>
    kuromoji.builder({ dicPath: join(import.meta.dirname, "../../node_modules/kuromoji/dict") }).build((e, t) => (e ? rej(e) : res(t))),
  );
  return (s: string) => {
    let x = s;
    for (const [k, v] of OVERRIDE) x = x.split(k).join(v);
    return kata2hira(tokenizer.tokenize(x).map((t) => (t.reading && t.reading !== "*" ? t.reading : t.surface_form)).join(""));
  };
}
export const hasKanji = (s: string) => /[一-龯々〆]/.test(s);
