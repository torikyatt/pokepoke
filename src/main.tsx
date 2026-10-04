import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BottomNav, Toast } from "./components/ui.tsx";
import { DataContext, type Ctx } from "./context.tsx";
import { loadData } from "./data/load.ts";
import "./index.css";
import { CardPage } from "./pages/CardPage.tsx";
import { DeckBuilderPage, DeckListPage, DeckViewPage, SharePage } from "./pages/DeckPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { useRoute } from "./router.ts";
import { createEngine } from "./search/engine.ts";
import { createSynergy } from "./synergy.ts";

// 本番ビルドでは import.meta.env.DEV が false になり、レビューページは含まれない
const ReviewPage = import.meta.env.DEV ? lazy(() => import("./pages/ReviewPage.tsx")) : null;

function Routes() {
  const { parts } = useRoute();
  useEffect(() => window.scrollTo(0, 0), [parts.join("/")]);
  switch (parts[0]) {
    case "card":
      return <CardPage id={parts[1]} />;
    case "deck":
      if (!parts[1]) return <DeckListPage />;
      return parts[2] === "edit" ? <DeckBuilderPage id={parts[1]} /> : <DeckViewPage id={parts[1]} />;
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

// デッキ編集中は本体アプリと同じく全画面（下のナビを出さない）
function Shell() {
  const { parts } = useRoute();
  const building = parts[0] === "deck" && parts[2] === "edit";
  return (
    <>
      <main className={`mx-auto min-h-dvh max-w-5xl ${building ? "" : "pb-24"}`}>
        <Routes />
      </main>
      <Toast />
      {!building && <BottomNav />}
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
