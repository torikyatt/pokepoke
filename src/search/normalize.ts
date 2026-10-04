// 検索用の正規化（SPEC 4.1）。辞書側もカードの文も同じ関数を通してから比べる。
// NFKC → 小文字 → カタカナをひらがなへ → 「エネルギー」を「エネ」に → 小書き文字・長音の揺れを吸収 → 記号を空白へ

const SMALL: Record<string, string> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", っ: "つ", ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ", ゕ: "か", ゖ: "け",
};

export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/えねるぎ[ー-]?/g, "えね")
    .replace(/[ぁぃぅぇぉっゃゅょゎゕゖ]/g, (c) => SMALL[c])
    .replace(/[ー〜~]/g, "")
    .replace(/[\s、。，．・「」『』（）()【】［］\[\]！？!?,.:：;；/＋+×]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}
