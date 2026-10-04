// ハッシュルーター。file:// でも GitHub Pages でも動くよう、URLの # 以降だけで画面を切り替える
//   #/            検索（?q=…&t=…&k=…&x=…）
//   #/card/<id>   カード詳細
//   #/deck        デッキ（#/deck/<id> で個別）
//   #/share/<code> 共有されたデッキ
//   #/settings    設定
//   #/review      レビュー（開発用）
import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const getHash = () => window.location.hash || "#/";

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, () => "#/");
  const [path, qs = ""] = hash.slice(1).split("?");
  const parts = path.split("/").filter(Boolean);
  return { parts, params: new URLSearchParams(qs) };
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
