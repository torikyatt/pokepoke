// カード詳細の履歴。詳細は画面の下からせり上がるシート（PCでは真ん中の列）で開き、
// 関連カードをたどるたびに積んでいく。
//   ・ブラウザの「戻る」と左上の戻るボタン … 1枚前のカードへ
//   ・右上の ✕ / 下へスワイプ          … まとめて閉じる（履歴は残す）
//   ・下の「最近見たカード」           … 閉じたときのカードと履歴のまま開き直す
// URLは変えず、ブラウザの履歴に { sheet: 何枚目か, card } を積んで「戻る」に対応する
import { create } from "zustand";

const MAX = 50;

interface DetailState {
  stack: string[];
  pos: number;
  open: boolean;
  snap: "full" | "half"; // スマホのシートの高さ（half は後ろの画面を見ながら使える）
}

export const useDetail = create<DetailState>()(() => ({ stack: [], pos: 0, open: false, snap: "full" }));

type SheetState = { sheet: number; card: string };
const isSheet = (st: unknown): st is SheetState => !!st && typeof (st as SheetState).sheet === "number" && typeof (st as SheetState).card === "string";
const push = (sheet: number, card: string) => history.pushState({ sheet, card } satisfies SheetState, "", location.href);

/** カードを開く。閉じていれば新しく始め、開いていればその上に積む */
export function openCard(id: string) {
  const s = useDetail.getState();
  if (s.open) {
    if (s.stack[s.pos] === id) return;
    const stack = [...s.stack.slice(0, s.pos + 1), id].slice(-MAX);
    useDetail.setState({ stack, pos: stack.length - 1 });
    push(stack.length - 1, id);
  } else {
    useDetail.setState({ stack: [id], pos: 0, open: true, snap: "full" });
    push(0, id);
  }
}

/** 閉じたときのカードと履歴のまま開き直す */
export function reopenDetail() {
  const s = useDetail.getState();
  if (s.open || !s.stack.length) return;
  for (let i = 0; i <= s.pos; i++) push(i, s.stack[i]);
  useDetail.setState({ open: true, snap: "full" });
}

/** 1枚前に戻る */
export function backDetail() {
  const s = useDetail.getState();
  if (s.pos <= 0) return;
  if (isSheet(history.state) && history.state.sheet > 0) history.back();
  else useDetail.setState({ pos: s.pos - 1 });
}

let after: (() => void) | undefined;
/** まとめて閉じる（履歴は残す）。閉じ終わってから then を呼ぶ */
export function closeDetail(then?: () => void) {
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
      if (s.stack[st.sheet] === st.card) useDetail.setState({ pos: st.sheet, open: true });
      else useDetail.setState({ stack: [st.card], pos: 0, open: true });
    } else {
      if (useDetail.getState().open) useDetail.setState({ open: false });
      const f = after;
      after = undefined;
      f?.();
    }
  });
}
