// ワザの最大ダメージ（相手1匹に与える分。ベンチへの「〜にも」は含めない）を、ダメージの数字と効果文から読む。
//   ・「〇〇なら△ダメージ追加」は足す（条件がそろったときの最大）
//   ・「コインをN回投げ、オモテの数×△」は N×△、「ランダムにN回選ばれ、選ばれた回数×△」は N×△（同じポケモンが全部選ばれたとき）
//   ・効果文でダメージを与えるワザ（メガカイリューex「選ばれたポケモンに250ダメージ」）は、その数字
//   ・数に上限の無いもの（ウラが出るまで・付いているエネの数・手札・トラッシュの枚数など）は、ふつうに起こりうる数（下の CAP）で数え、uncapped を付ける
//   ・ベンチの数・ポイントなど、ゲームのルールで上限が決まっているものは、その上限で数える
import type { Attack } from "./types.ts";

/** 上限の無い数を、どこまで数えるか（並べ替えの目安。カード詳細には「上限なし」と出す） */
export const CAP = {
  heads: 4, // ウラが出るまでコインを投げたときのオモテの数
  energy: 5, // 1匹に付いているエネ
  energyAll: 8, // 場のポケモン全員に付いているエネ
  cards: 8, // 手札・トラッシュ・山札の中の枚数、使った回数
};

export interface MaxDamage {
  max: number;
  uncapped: boolean;
}

/** 「for each 〇〇」の〇〇の数の上限。[数, 上限が無いか] */
function countOf(what: string): [number, boolean] {
  const w = what.toLowerCase();
  if (/heads/.test(w)) return [1, false]; // 呼び出し元で数える
  if (/benched pokémon \(both yours and your opponent.s\)/.test(w)) return [6, false];
  if (/bench/.test(w)) return [3, false];
  if (/pokémon you have in play|pokémon in play|maushold you have in play/.test(w)) return [4, false];
  if (/point/.test(w)) return [2, false]; // 3ポイントで勝負がつくので、それまでに取れるのは2ポイント
  if (/retreat cost/.test(w)) return [4, false];
  if (/special condition/.test(w)) return [3, false]; // どく・やけど・（ねむり・マヒ・こんらんのどれか1つ）
  if (/knocked out/.test(w)) return [2, false];
  if (/^time/.test(w)) return [CAP.heads, true]; // ワザ・特性を使った回数
  if (/type of energy/.test(w)) return [3, false]; // エネルギーゾーンのタイプは3つまで
  if (/pokémon tool attached to all/.test(w)) return [4, false];
  if (/energy attached to all of/.test(w)) return [CAP.energyAll, true];
  if (/energy/.test(w)) return [CAP.energy, true];
  return [CAP.cards, true]; // 手札・トラッシュ・山札・使った回数・名前の合うポケモンなど
}

export function maxDamageOf(a: Pick<Attack, "damage" | "textEn">): MaxDamage {
  const t = (a.textEn ?? "").replace(/\s+/g, " ");
  const base = a.damage ?? 0;
  let max = base;
  let uncapped = false;
  // ベンチだけに与えるダメージの文は除く（「also does 20 damage to ... Benched」「to each of your opponent's Benched」）
  const sentences = t.split(/(?<=\.)\s+/).filter((s) => !/also do(es)? \d+ damage|damage to (each of )?your opponent.s Benched|to each of your opponent.s Benched|damage to itself|to 1 of your Benched/.test(s) || /chosen at random/.test(s));
  const text = sentences.join(" ");

  // コインの回数: 「Flip N coins」は N、「until you get tails」は上限なし、「for each 〇〇」はその数
  const coins = (() => {
    // 「どうぐが付いていれば、かわりに4回投げる」（エテボース）のように回数が変わるものは、多いほう
    const fixed = [...text.matchAll(/[Ff]lip (\d+) coins/g)].map((m) => Number(m[1]));
    if (fixed.length) return { n: Math.max(...fixed), uncapped: false };
    let m: RegExpMatchArray | null;
    if (/until you get tails/.test(text)) return { n: CAP.heads, uncapped: true };
    m = text.match(/Flip a coin for each ([^.]+?)\./);
    if (m) {
      const [n, u] = countOf(m[1]);
      return { n, uncapped: u };
    }
    return { n: 1, uncapped: false };
  })();

  // 「△ダメージ × 〇〇の数」（more があれば base に足す、無ければ base の代わり）
  const each = [...text.matchAll(/does (\d+) (more )?damage (?:to 1 of your opponent.s Pokémon )?for each ([^.]+?)(?:\.|$)/g)];
  for (const m of each) {
    const x = Number(m[1]);
    const what = m[3];
    let n: number;
    let u = false;
    if (/heads/.test(what)) {
      n = coins.n;
      u = coins.uncapped;
    } else if (/card you discarded|Pokémon you discarded|Energy you discarded|Pokémon you revealed|you find there/.test(what)) {
      const up = text.match(/(?:up to|top) (\d+)/);
      n = up ? Number(up[1]) : /Energy/.test(what) ? CAP.energy : 3;
      u = !up && /Energy/.test(what);
      if (/For each heads, discard/.test(text)) {
        n = coins.n;
        u = coins.uncapped;
      }
    } else [n, u] = countOf(what);
    const v = (m[2] ? base : 0) + x * n;
    max = Math.max(max, v);
    uncapped ||= u;
  }

  // ランダムにN回選ばれ、選ばれた回数×△（全部同じポケモンが選ばれたとき）
  const random = text.match(/chosen at random (\d+) times\. For each time a Pokémon was chosen, (?:also )?do (\d+) damage/);
  if (random) max = Math.max(max, (/Benched/.test(text) ? base : 0) + Number(random[1]) * Number(random[2]));
  const randomEach = text.match(/chosen at random for each ([^.]+?)\. For each time a Pokémon was chosen, do (\d+) damage/);
  if (randomEach) {
    const [n, u] = countOf(randomEach[1]);
    max = Math.max(max, n * Number(randomEach[2]));
    uncapped ||= u;
  }

  // 効果文で与えるダメージ（ダメージの数字が無いワザ）: 「Do 250 damage to it」「does 50 damage to 1 of your opponent's Pokémon」
  if (!each.length && !random && !randomEach) {
    for (const m of text.matchAll(/(?:Do|does) (\d+) damage to (?:it|that Pokémon|the chosen Pokémon|1 of your opponent.s (?:Benched )?Pokémon|your opponent.s Active Pokémon)/g)) {
      max = Math.max(max, Number(m[1]));
    }
  }

  // 条件付きの追加（「〇〇なら△ダメージ追加」）。for each の文は上で数えたので除く。
  // コインの結果で分かれるもの（テツノドクガ「オモテが1回なら…2回なら…全部なら」）はどれか1つ、ほかは全部そろったときの合計
  if (!each.some((m) => m[2])) {
    const bonuses = sentences.filter((s) => !/for each/.test(s)).flatMap((s) => [...s.matchAll(/(\d+) more damage/g)].map((m) => Number(m[1])));
    const bonus = /heads/.test(text) ? Math.max(0, ...bonuses) : bonuses.reduce((s, n) => s + n, 0);
    max = Math.max(max, base + bonus);
  }
  return { max, uncapped };
}
