import { lazy, StrictMode, Suspense, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { BottomNav, Logo, Toast } from "./components/ui.tsx";
import { DataContext, type Ctx } from "./context.tsx";
import { loadData } from "./data/load.ts";
import "./index.css";
import { parseHash, scrollPos, useNav, type Tab } from "./nav.ts";
import { DetailDock, DetailSheet } from "./components/detail.tsx";
import { useDetail } from "./detail.ts";
import { Desktop } from "./pages/Desktop.tsx";
import { DeckBuilderPage, DeckListPage, DeckViewPage, SharePage } from "./pages/DeckPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { PoolScope } from "./pool.ts";
import { RouteContext, useHash, useRoute } from "./router.ts";
import { createEngine } from "./search/engine.ts";
import { createSynergy } from "./synergy.ts";
import { useLang, useT } from "./i18n.ts";

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
  // ページの下の余白: 下に浮かぶもの（タブ・「最近見たカード」・半分開いた詳細）に最後の行が隠れず、スクロールで出せるように
  const docked = useDetail((s) => s.stack.length > 0 && !s.open);
  const half = useDetail((s) => s.open && s.snap === "half");
  const bottomPad = half
    ? "calc(47dvh + 1.5rem)" // 半分開いた詳細シート（高さ 94dvh の半分）の上まで
    : building
      ? undefined // デッキ編集は自分で余白を持つ
      : docked
        ? "calc(9.5rem + env(safe-area-inset-bottom))" // 下のタブ＋「最近見たカード」
        : "6rem";
  return (
    <>
      {TABS.filter((t) => t === active || visited.includes(t)).map((t) => (
        <RouteContext.Provider key={t} value={base[t]}>
          <main hidden={t !== active} className="mx-auto min-h-dvh max-w-5xl" style={{ paddingBottom: bottomPad }}>
            <Routes />
          </main>
        </RouteContext.Provider>
      ))}
      {/* 下のタブやデッキ編集の ✓ ボタンから少し離して浮かせる */}
      <DetailDock bottom={building ? "max(1.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))" : "calc(4.4rem + env(safe-area-inset-bottom))"} />
      <DetailSheet />
      <Toast />
      {!building && <BottomNav />}
    </>
  );
}

function Layout() {
  // 表示言語を <html lang> にも反映する（読み上げ・フォント選び・ブラウザの翻訳提案のため）
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === "en" ? "POKÉPOKE DEX – Pokémon TCG Pocket Card Dex & Deck Builder" : "POKÉPOKE DEX｜ポケポケのカード図鑑";
  }, [lang]);
  return useIsDesktop() ? <Desktop /> : <Shell />;
}

function App() {
  const [ctx, setCtx] = useState<Ctx>();
  const [error, setError] = useState<string>();
  const t = useT();
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
        {t("データを読み込めませんでした。新しめのブラウザで開いてください。", "Couldn't load the data. Please use a recent browser.")}
        <pre className="mt-2 text-xs whitespace-pre-wrap text-muted">{error}</pre>
      </div>
    );
  if (!ctx)
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted">
        <div className="text-center font-bold">
          <div className="mb-4 flex justify-center">
            <Logo className="text-2xl" />
          </div>
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-line border-t-accent" />
          {t("カードデータを展開中…", "Unpacking card data…")}
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
