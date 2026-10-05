// 雑なローマ字で日本語のカード名・表現を探す（hakase → 博士の研究、dakurai → ダークライ、monomane → モノマネむすめ）。
// カード名（漢字はよみ）をローマ字にし、入力と同じ「ゆるいローマ字」にそろえてから部分一致で比べる。
//   ゆるくする: shi/si・chi/ti・tsu/tu・fu/hu・ji/zi・cha/tya の違い、のばす音（ー・おう・ああ）、小さい「っ」、ん の書き方

const KANA: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko", が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "si", す: "su", せ: "se", そ: "so", ざ: "za", じ: "zi", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "ti", つ: "tu", て: "te", と: "to", だ: "da", ぢ: "zi", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "hu", へ: "he", ほ: "ho", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo", ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", を: "o", ん: "n", ゔ: "bu",
};
const SMALL_Y: Record<string, string> = { ゃ: "ya", ゅ: "yu", ょ: "yo" };
const SMALL_V: Record<string, string> = { ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };

/** ひらがな・カタカナ → ローマ字（訓令式寄り）。かな以外（ex・数字）はそのまま */
export function kanaToRomaji(s: string): string {
  const h = s.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  let out = "";
  for (const ch of h) {
    if (KANA[ch]) out += KANA[ch];
    else if (SMALL_Y[ch]) out = out.replace(/i$/, "") + SMALL_Y[ch]; // き+ゃ → kya
    else if (SMALL_V[ch]) out = out.replace(/[aiueo]$/, "") + SMALL_V[ch]; // ふ+ぁ → ha（f は h にそろえる）、て+ぃ → ti
    else if (ch === "っ" || ch === "ー" || ch === "ゎ") continue; // 小さい「っ」とのばす音は、ゆるくするときに消える
    else out += ch;
  }
  return out;
}

/** 入力のローマ字も、かなから作ったローマ字も、この形にそろえて比べる */
export function looseRomaji(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/tch/g, "ch")
    .replace(/sh(?=[aueo])/g, "sy")
    .replace(/ch(?=[aueo])/g, "ty")
    .replace(/j(?=[aueo])/g, "zy")
    .replace(/shi/g, "si")
    .replace(/chi/g, "ti")
    .replace(/tsu/g, "tu")
    .replace(/ji/g, "zi")
    .replace(/d(?=[iu])/g, "z") // di・du → zi・zu（ぢ・づ）
    .replace(/f/g, "h")
    .replace(/l/g, "r")
    .replace(/v/g, "b")
    .replace(/c(?=[aou])/g, "k")
    .replace(/c/g, "s")
    .replace(/wo/g, "o")
    .replace(/m(?=[bp])/g, "n")
    .replace(/([b-df-hj-np-tv-z])\1+/g, "$1") // 小さい「っ」（tt・kk）と nn
    .replace(/ou/g, "o")
    .replace(/ei/g, "e")
    .replace(/([aiueo])\1+/g, "$1"); // のばす音
}

export const romajiKey = (kanaOrText: string) => looseRomaji(kanaToRomaji(kanaOrText));
