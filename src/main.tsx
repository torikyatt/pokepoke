import { lazy, StrictMode, Suspense, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { BottomNav, Toast } from "./components/ui.tsx";
import { DataContext, type Ctx } from "./context.tsx";
import { loadData } from "./data/load.ts";
import "./index.css";
import { parseHash, scrollPos, useNav, type Tab } from "./nav.ts";
import { DetailDock, DetailSheet } from "./components/detail.tsx";
import { Desktop } from "./pages/Desktop.tsx";
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

// PCは横幅1024px以上（一覧・詳細・デッキを横に並べる）
const wideQuery = window.matchMedia("(min-width: 1024px)");
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      wideQuery.addEventListener("change", cb);
      return () => wideQuery.removeEventListener("change", cb);
    },
    () => wideQuery.matches,
  );
}

function Shell() {
  const hash = useHash();
  const { active, base, visited, sync } = useNav();
  useLayoutEffect(() => sync(hash), [hash]);

  // タブを切り替えたら、そのタブのスクロール位置に戻す
  useLayoutEffect(() => {
    window.scrollTo(0, scrollPos[active] ?? 0);
  }, [active, base[active]]);
  useEffect(() => {
    const onScroll = () => {
      // 詳細をいっぱいに開いている間は後ろを固定しているので、位置を覚え直さない
      if (document.documentElement.style.overflow !== "hidden") scrollPos[useNav.getState().active] = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
      <DetailDock bottom={building ? "0px" : "calc(3.65rem + env(safe-area-inset-bottom))"} />
      <DetailSheet />
      <Toast />
      {!building && <BottomNav />}
    </>
  );
}

function Layout() {
  return useIsDesktop() ? <Desktop /> : <Shell />;
}

function App() {
  const [ctx, setCtx] = useState<Ctx>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    loadData()
      .then((data) => {
        const synergy = createSynergy(data);
        setCtx({ data, engine: createEngine(data, { partners: synergy.partners }), synergy, byId: new Map(data.cards.map((c) => [c.id, c])) });
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
          <div className="mb-4 text-2xl font-extrabold tracking-wider text-ink">POKÉPOKE LAB</div>
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent" />
          カードデータを展開中…
        </div>
      </div>
    );
  return (
    <DataContext.Provider value={ctx}>
      <Layout />
    </DataContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
