// カード詳細の履歴。詳細は画面の下からせり上がるシート（PCでは真ん中の列）で開き、
// 関連カードをたどるたびに積んでいく。
//   ・ブラウザの「戻る」と左上の戻るボタン … 1枚前のカードへ
//   ・右上の ✕ / 下へスワイプ          … まとめて閉じる（履歴は残す）
//   ・下の「最後に見たカード」         … 閉じたときのカードと履歴のまま開き直す
//   ・開いている間の下のボタン（‹ ✕ ›）  … 開いた一覧（検索結果・デッキ・相性のいいカードなど）の前・次のカードへ（履歴は積まずに置きかえる）
//     一覧は履歴の1枚ごとに覚えておき、「戻る」で前のカードに戻ると、そのカードを開いた一覧に戻る
// URLは変えず、ブラウザの履歴に { sheet: 何枚目か, card } を積んで「戻る」に対応する
import { create } from "zustand";

const MAX = 50;
let anchor: { name: string; top: number } | undefined;

interface DetailState {
  stack: string[];
  lists: string[][]; // stack の1枚ごとに、そのカードを開いた一覧
  pos: number;
  open: boolean;
  // 開き方: new = 新しく開いた（いちばん上から）、history = 戻る・進む・開き直し（前に見ていた位置へ）
  nav: { seq: number; kind: "new" | "history" };
  snap: "full" | "half"; // スマホのシートの高さ（half は後ろの画面を見ながら使える）
  list: string[]; // いまのカードを開いた一覧（lists[pos]）。前・次のカードはこの並びで
  listPos: number; // 一覧の中で、いま見ているカードの位置。-1 は一覧の外
  step: number; // 前・次のカードへ移った回数（移るたびに詳細を少しだけ横にずらして戻す合図）
  stepDir: number; // 最後に移った向き（+1 次へ / -1 前へ）
}

export const useDetail = create<DetailState>()(() => ({ stack: [], lists: [], pos: 0, open: false, snap: "full", nav: { seq: 0, kind: "new" }, list: [], listPos: -1, step: 0, stepDir: 0 }));
const nav = (kind: "new" | "history") => ({ nav: { seq: useDetail.getState().nav.seq + 1, kind } });
/** 履歴の pos 枚目に移ったときの状態（そのカードを開いた一覧に戻す） */
const at = (stack: string[], lists: string[][], pos: number) => {
  const list = lists[pos] ?? [];
  return { stack, lists, pos, list, listPos: list.indexOf(stack[pos]) };
};

type SheetState = { sheet: number; card: string };
const isSheet = (st: unknown): st is SheetState => !!st && typeof (st as SheetState).sheet === "number" && typeof (st as SheetState).card === "string";
const push = (sheet: number, card: string) => history.pushState({ sheet, card } satisfies SheetState, "", location.href);

/**
 * カードを開く。閉じていれば新しく始め、開いていればその上に積む。
 * list: そのカードを開いた一覧（前・次のカードに使う。相性のいいカード・進化ラインなど、詳細の中の一覧も渡す）。
 *       渡さなければ、いまの一覧のまま
 */
export function openCard(id: string, list?: string[]) {
  // 閉じる動きの途中に次のカードが押されたら、動きを待たずに閉じ終え、すぐ新しく開く（シートは下がりかけた位置から上がる）
  if (closing) {
    const c = closing;
    closing = undefined;
    c.stop();
    closeNow(() => openCard(id, list));
    return;
  }
  const s = useDetail.getState();
  const l = list ?? s.list;
  if (s.open) {
    if (s.stack[s.pos] === id) {
      anchor = undefined;
      if (list) useDetail.setState(at(s.stack, s.lists.map((x, i) => (i === s.pos ? l : x)), s.pos));
      return;
    }
    const stack = [...s.stack.slice(0, s.pos + 1), id];
    const lists = [...s.lists.slice(0, s.pos + 1), l];
    const cut = Math.max(0, stack.length - MAX);
    useDetail.setState({ ...at(stack.slice(cut), lists.slice(cut), stack.length - 1 - cut), ...nav("new") });
    push(stack.length - 1 - cut, id);
  } else {
    useDetail.setState({ ...at([id], [l], 0), open: true, snap: "full", ...nav("new") });
    push(0, id);
  }
}

/** 一覧の前（-1）・次（+1）のカードへ。いまのカードを置きかえる（ブラウザの「戻る」は前に見ていた関連カードへ戻るまま） */
export function stepCard(d: number) {
  const s = useDetail.getState();
  if (!s.open || s.listPos < 0) return;
  const i = Math.min(s.list.length - 1, Math.max(0, s.listPos + d));
  if (i === s.listPos) return;
  const id = s.list[i];
  const stack = [...s.stack.slice(0, s.pos), id];
  useDetail.setState({ ...at(stack, s.lists.slice(0, s.pos + 1), s.pos), step: s.step + 1, stepDir: Math.sign(d), ...nav("new") });
  history.replaceState({ sheet: s.pos, card: id } satisfies SheetState, "", location.href);
}

// 進化ラインなどから別のカードへ移ったとき、同じ欄が画面の同じ高さに来るようにする（見比べやすいように）
/** 次に開くカードで、data-anchor={name} の欄をスクロール枠の上から top px の位置に合わせる */
export function setScrollAnchor(name: string, top: number) {
  anchor = { name, top };
}
export function takeScrollAnchor() {
  const a = anchor;
  anchor = undefined;
  return a;
}

/** 閉じたときのカードと履歴のまま開き直す */
export function reopenDetail() {
  const s = useDetail.getState();
  if (s.open || !s.stack.length) return;
  for (let i = 0; i <= s.pos; i++) push(i, s.stack[i]);
  useDetail.setState({ open: true, snap: "full", ...nav("history") });
}

/** 1枚前に戻る */
export function backDetail() {
  const s = useDetail.getState();
  if (s.pos <= 0) return;
  if (isSheet(history.state) && history.state.sheet > 0) history.back();
  else useDetail.setState({ ...at(s.stack, s.lists, s.pos - 1), ...nav("history") });
}

// スマホのシートは、閉じる動きを先に最後まで見せてから、状態とブラウザの履歴を戻す。
// （iPhone の Safari は履歴を戻すときやページのスクロールを戻すときに重い処理が入り、動きの途中だとカクつくため）
// 閉じる動き（done で動き終わりを知らせる。戻り値は動きを待つのをやめる関数）
type Animator = (done: () => void) => () => void;
let animateClose: Animator | undefined;
export function setCloseAnimator(f: Animator | undefined) {
  animateClose = f;
}
// 閉じる動きの途中（まだ閉じた状態にしていない）。この間に次のカードが押されたら、待たずにすぐ開き直す
let closing: { stop: () => void; run: Animator; then?: () => void } | undefined;

let after: (() => void) | undefined;
/** まとめて閉じる（履歴は残す）。閉じ終わってから then を呼ぶ */
export function closeDetail(then?: () => void) {
  if (closing) return; // 動いている間に何度も押されても1回だけ
  if (animateClose && useDetail.getState().open) {
    const run = animateClose;
    const stop = run(() => {
      closing = undefined;
      closeNow(then);
    });
    closing = { stop, run, then };
  } else closeNow(then);
}
function closeNow(then?: () => void) {
  const st = history.state;
  const wasOpen = useDetail.getState().open;
  useDetail.setState({ open: false });
  if (wasOpen && isSheet(st)) {
    after = then;
    history.go(-(st.sheet + 1));
  } else then?.();
}

if (typeof window !== "undefined") {
  // スクロール位置はアプリが自分で戻す（タブごと・main.tsx）。ブラウザに任せると、詳細を閉じて履歴を戻したとき、
  // 開く前の位置へ跳ね戻る（閉じる動きの間に後ろの一覧をスクロールしていても）。あとから積む履歴もこの設定を引き継ぐ
  history.scrollRestoration = "manual";
  window.addEventListener("popstate", (e) => {
    const st = e.state;
    if (isSheet(st)) {
      const s = useDetail.getState();
      if (s.stack[st.sheet] === st.card) useDetail.setState({ ...at(s.stack, s.lists, st.sheet), open: true, ...nav("history") });
      else useDetail.setState({ ...at([st.card], [[]], 0), open: true, ...nav("history") });
    } else {
      if (useDetail.getState().open) useDetail.setState({ open: false });
      const f = after;
      after = undefined;
      f?.();
    }
  });
}
