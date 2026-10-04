import { lazy, StrictMode, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BottomNav, Toast } from "./components/ui.tsx";
import { DataContext, type Ctx } from "./context.tsx";
import { loadData } from "./data/load.ts";
import "./index.css";
import { parseHash, scrollPos, useNav, type Tab } from "./nav.ts";
import { CardPage } from "./pages/CardPage.tsx";
import { DeckBuilderPage, DeckListPage, DeckViewPage, SharePage } from "./pages/DeckPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { PoolScope } from "./pool.ts";
import { RouteContext, useHash, useRoute } from "./router.ts";
import { createEngine } from "./search/engine.ts";
import { createSynergy } from "./synergy.ts";

// 本番ビルドでは import.meta.env.DEV が false になり、レビューページは含まれない
const ReviewPage = import.meta.env.DEV ? lazy(() => import("./pages/ReviewPage.tsx")) : null;
const TABS: Tab[] = ["search", "deck", "settings"];

/** タブのベースの画面 */
function Routes() {
  const { parts } = useRoute();
  switch (parts[0]) {
    case "deck":
      if (!parts[1]) return <DeckListPage />;
      return parts[2] === "edit" ? (
        <PoolScope.Provider value="builder">
          <DeckBuilderPage id={parts[1]} />
        </PoolScope.Provider>
      ) : (
        <DeckViewPage id={parts[1]} />
      );
    case "share":
      return <SharePage code={parts[1] ?? ""} />;
    case "settings":
      return <SettingsPage />;
    case "review":
      return ReviewPage ? (
        <Suspense fallback={null}>
          <ReviewPage />
        </Suspense>
      ) : (
        <SettingsPage />
      );
    default:
      return <SearchPage />;
  }
}

/** カード詳細は、今のタブの画面の上に重ねて開く（閉じると一覧が元の位置のまま残る） */
function CardOverlay({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => ref.current?.scrollTo(0, 0), [id]);
  return (
    <RouteContext.Provider value={`#/card/${id}`}>
      <div ref={ref} className="fixed inset-0 z-[45] overflow-y-auto overscroll-contain bg-canvas pb-24">
        <div className="mx-auto max-w-5xl">
          <CardPage id={id} />
        </div>
      </div>
    </RouteContext.Provider>
  );
}

function Shell() {
  const hash = useHash();
  const { active, base, card, visited, sync } = useNav();
  useLayoutEffect(() => sync(hash), [hash]);

  // タブを切り替えたら、そのタブのスクロール位置に戻す
  useLayoutEffect(() => {
    window.scrollTo(0, scrollPos[active] ?? 0);
  }, [active, base[active]]);
  useEffect(() => {
    const onScroll = () => {
      const s = useNav.getState();
      if (!s.card[s.active]) scrollPos[s.active] = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // 詳細を開いている間は、下の一覧がスクロールしないようにする
  const overlay = card[active];
  useEffect(() => {
    document.documentElement.style.overflow = overlay ? "hidden" : "";
  }, [overlay]);

  const building = active === "deck" && parseHash(base.deck).parts[2] === "edit";
  return (
    <>
      {TABS.filter((t) => t === active || visited.includes(t)).map((t) => (
        <RouteContext.Provider key={t} value={base[t]}>
          <main hidden={t !== active} className={`mx-auto min-h-dvh max-w-5xl ${t === "deck" && building ? "" : "pb-24"}`}>
            <Routes />
          </main>
        </RouteContext.Provider>
      ))}
      {overlay && <CardOverlay id={overlay} />}
      <Toast />
      {!(building && !overlay) && <BottomNav />}
    </>
  );
}

function App() {
  const [ctx, setCtx] = useState<Ctx>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    loadData()
      .then((data) => {
        setCtx({ data, engine: createEngine(data), synergy: createSynergy(data), byId: new Map(data.cards.map((c) => [c.id, c])) });
      })
      .catch((e) => setError(String(e)));
  }, []);
  if (error)
    return (
      <div className="p-6 text-sm">
        データを読み込めませんでした。新しめのブラウザで開いてください。
        <pre className="mt-2 text-xs whitespace-pre-wrap text-muted">{error}</pre>
      </div>
    );
  if (!ctx)
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted">
        <div className="text-center font-bold">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent" />
          カードデータを展開中…
        </div>
      </div>
    );
  return (
    <DataContext.Provider value={ctx}>
      <Shell />
    </DataContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
