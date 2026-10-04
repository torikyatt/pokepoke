// ハッシュルーター。file:// でも GitHub Pages でも動くよう、URLの # 以降だけで画面を切り替える
//   #/            検索（?q=…&x=…&tag=…）
//   #/card/<id>   カード詳細（今のタブの上に重ねて開く）
//   #/deck        デッキ一覧（#/deck/<id> で確認、#/deck/<id>/edit で編集）
//   #/share/<code> 共有されたデッキ
//   #/settings    設定
//   #/review      レビュー（開発用）
// タブごとの「最後にいた場所」は nav.ts。各タブの画面は自分のURLを RouteContext で受け取る
import { createContext, useContext, useSyncExternalStore } from "react";
import { parseHash } from "./nav.ts";

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const getHash = () => window.location.hash || "#/";

export function useHash() {
  return useSyncExternalStore(subscribe, getHash, () => "#/");
}

export const RouteContext = createContext<string | null>(null);

/** この画面のURL（タブの中ならそのタブのURL、そうでなければ今のURL） */
export function useRoute() {
  const ctx = useContext(RouteContext);
  const hash = useHash();
  return parseHash(ctx ?? hash);
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`;
  if (opts.replace) {
    history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = path;
  }
}

export function searchPath(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/?${s}` : "/";
}
