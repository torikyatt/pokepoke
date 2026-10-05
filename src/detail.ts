// カード詳細の履歴。詳細は画面の下からせり上がるシート（PCでは真ん中の列）で開き、
// 関連カードをたどるたびに積んでいく。
//   ・ブラウザの「戻る」と左上の戻るボタン … 1枚前のカードへ
//   ・右上の ✕ / 下へスワイプ          … まとめて閉じる（履歴は残す）
//   ・下の「最近見たカード」           … 閉じたときのカードと履歴のまま開き直す
// URLは変えず、ブラウザの履歴に { sheet: 何枚目か, card } を積んで「戻る」に対応する
import { create } from "zustand";

const MAX = 50;
let anchor: { name: string; top: number } | undefined;

interface DetailState {
  stack: string[];
  pos: number;
  open: boolean;
  // 開き方: new = 新しく開いた（いちばん上から）、history = 戻る・進む・開き直し（前に見ていた位置へ）
  nav: { seq: number; kind: "new" | "history" };
  snap: "full" | "half"; // スマホのシートの高さ（half は後ろの画面を見ながら使える）
}

export const useDetail = create<DetailState>()(() => ({ stack: [], pos: 0, open: false, snap: "full", nav: { seq: 0, kind: "new" } }));
const nav = (kind: "new" | "history") => ({ nav: { seq: useDetail.getState().nav.seq + 1, kind } });

type SheetState = { sheet: number; card: string };
const isSheet = (st: unknown): st is SheetState => !!st && typeof (st as SheetState).sheet === "number" && typeof (st as SheetState).card === "string";
const push = (sheet: number, card: string) => history.pushState({ sheet, card } satisfies SheetState, "", location.href);

/** カードを開く。閉じていれば新しく始め、開いていればその上に積む */
export function openCard(id: string) {
  const s = useDetail.getState();
  if (s.open) {
    if (s.stack[s.pos] === id) {
      anchor = undefined;
      return;
    }
    const stack = [...s.stack.slice(0, s.pos + 1), id].slice(-MAX);
    useDetail.setState({ stack, pos: stack.length - 1, ...nav("new") });
    push(stack.length - 1, id);
  } else {
    useDetail.setState({ stack: [id], pos: 0, open: true, snap: "full", ...nav("new") });
    push(0, id);
  }
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
  else useDetail.setState({ pos: s.pos - 1, ...nav("history") });
}

// スマホのシートは、閉じる動きを先に最後まで見せてから、状態とブラウザの履歴を戻す。
// （iPhone の Safari は履歴を戻すときやページのスクロールを戻すときに重い処理が入り、動きの途中だとカクつくため）
let animateClose: ((done: () => void) => void) | undefined;
export function setCloseAnimator(f: typeof animateClose) {
  animateClose = f;
}

let after: (() => void) | undefined;
/** まとめて閉じる（履歴は残す）。閉じ終わってから then を呼ぶ */
export function closeDetail(then?: () => void) {
  if (animateClose && useDetail.getState().open) {
    const run = animateClose;
    animateClose = undefined; // 動いている間に何度も押されても1回だけ
    run(() => {
      animateClose = run;
      closeNow(then);
    });
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
  window.addEventListener("popstate", (e) => {
    const st = e.state;
    if (isSheet(st)) {
      const s = useDetail.getState();
      if (s.stack[st.sheet] === st.card) useDetail.setState({ pos: st.sheet, open: true, ...nav("history") });
      else useDetail.setState({ stack: [st.card], pos: 0, open: true, ...nav("history") });
    } else {
      if (useDetail.getState().open) useDetail.setState({ open: false });
      const f = after;
      after = undefined;
      f?.();
    }
  });
}
