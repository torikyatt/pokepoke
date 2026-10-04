import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BottomNav, Toast } from "./components/ui.tsx";
import { DataContext, type Ctx } from "./context.tsx";
import { loadData } from "./data/load.ts";
import "./index.css";
import { CardPage } from "./pages/CardPage.tsx";
import { DeckPage, SharePage } from "./pages/DeckPage.tsx";
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
      return <DeckPage />;
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
        <pre className="mt-2 text-xs whitespace-pre-wrap text-slate-500">{error}</pre>
      </div>
    );
  if (!ctx)
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-slate-500">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-red-600" />
          カードデータを展開中…
        </div>
      </div>
    );
  return (
    <DataContext.Provider value={ctx}>
      <main className="mx-auto min-h-dvh max-w-5xl pb-20">
        <Routes />
      </main>
      <Toast />
      <BottomNav />
    </DataContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
