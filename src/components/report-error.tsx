// カードの誤りの報告（カード詳細の左上のボタンから開く）。送ったものは集計ページ（/api/report）の「誤りの報告」で見る
//   ・対象カード: 開いていたカードの名前と固有番号（収録パックのID＋カード番号）が入っている。書き換え・消去は自由
//   ・何の訂正か（プルダウン）・内容（120字まで）・画像（2枚まで。端末で長い辺1280pxのJPEGに縮めてから送る）
import { useEffect, useState } from "react";
import { isSingleFile } from "../data/load.ts";
import { cardName, useLang, useT } from "../i18n.ts";
import { useToast } from "../store.ts";
import type { AppCard } from "../types.ts";
import { Sheet } from "./ui.tsx";

/** 種類（キーはサーバーの REPORT_CATEGORIES と同じ） */
const CATEGORIES: [string, string, string][] = [
  ["info", "カード名・効果文などのカード情報", "Card info (name, text, etc.)"],
  ["image", "カード画像", "Card image"],
  ["evolution", "進化ライン", "Evolution line"],
  ["partners", "相性のいいカード", "Good partners"],
  ["combos", "定番の組み合わせ", "Known combos"],
  ["tournament", "大会での使われ方", "Tournament usage"],
  ["search", "検索結果", "Search results"],
  ["other", "その他", "Other"],
];
const MAX_CHARS = 120;
const MAX_IMAGES = 2;

/** 画像を長い辺1280pxまでのJPEGに縮め、base64（data: を除いた部分）にする */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  for (const q of [0.82, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length < 1_000_000) return url.slice(url.indexOf(",") + 1);
  }
  throw new Error("too large");
}

export function ReportErrorSheet({ open, onClose, card }: { open: boolean; onClose: () => void; card?: AppCard }) {
  const t = useT();
  const lang = useLang();
  const show = useToast((s) => s.show);
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState("info");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  // 開くたびに、開いていたカードを入れ直す
  useEffect(() => {
    if (!open) return;
    setTarget(card ? `${cardName(card, lang)}（${card.id.toUpperCase()}）` : "");
    setCategory("info");
    setBody("");
    setImages([]);
  }, [open, card, lang]);
  const chars = [...body].length;
  const canSend = !sending && chars <= MAX_CHARS && (body.trim() !== "" || images.length > 0);

  const addImages = async (files: FileList | null) => {
    for (const f of [...(files ?? [])].slice(0, MAX_IMAGES - images.length)) {
      try {
        const b64 = await shrink(f);
        setImages((cur) => (cur.length < MAX_IMAGES ? [...cur, b64] : cur));
      } catch {
        show(t("画像を読み込めませんでした", "Couldn't read the image"), "error");
      }
    }
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: target, category, body, lang, images }) });
      if (!res.ok) throw new Error(String(res.status));
      show(t("報告を送りました。ありがとうございます！", "Report sent. Thank you!"));
      onClose();
    } catch {
      show(t("送れませんでした。時間をおいてもう一度お試しください", "Couldn't send. Please try again later."), "error");
    } finally {
      setSending(false);
    }
  };

  const field = "neu-in w-full rounded-2xl px-3 py-2.5 text-sm font-bold outline-none";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("誤りを報告", "Report an error")}
      z="z-[60]"
      footer={
        <button type="button" disabled={!canSend} onClick={send} className="btn-ok w-full rounded-full py-3 text-base disabled:opacity-40">
          {sending ? t("送信中…", "Sending…") : t("送信する", "Send")}
        </button>
      }
    >
      <div className="space-y-4 pt-1 pb-2">
        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-muted">{t("対象カード", "Card")}</span>
          <input type="text" value={target} onChange={(e) => setTarget(e.target.value)} maxLength={80} placeholder={t("カード名（A1-001 など）", "Card name (e.g. A1-001)")} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-extrabold text-muted">{t("何の訂正ですか？", "What needs fixing?")}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {CATEGORIES.map(([k, ja, en]) => (
              <option key={k} value={k}>
                {lang === "en" ? en : ja}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-xs font-extrabold text-muted">
            <span>{t("内容", "Details")}</span>
            <span className={`tabular-nums ${chars > MAX_CHARS ? "text-[#c4302b]" : ""}`}>
              {chars} / {MAX_CHARS}
            </span>
          </span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder={t("どこがどう違うかを書いてください（120字まで）", "Tell us what's wrong (up to 120 characters)")} className={`${field} resize-none font-medium`} />
        </label>
        <div>
          <span className="mb-1 block text-xs font-extrabold text-muted">{t(`画像（${MAX_IMAGES}枚まで・任意）`, `Images (up to ${MAX_IMAGES}, optional)`)}</span>
          {category === "image" && (
            <p className="mb-2 rounded-xl bg-[#e8f6f3] px-3 py-2 text-xs font-bold text-accent-deep">
              {t("カード画像が違う場合は、正しいカードの画像（ゲーム内のスクリーンショットなど）を添付してください。", "If the card image is wrong, please attach an image of the correct card (e.g. an in-game screenshot).")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {images.map((b64, i) => (
              <div key={i} className="relative">
                <img src={`data:image/jpeg;base64,${b64}`} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <button type="button" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))} aria-label={t("この画像を外す", "Remove this image")} className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-badge text-xs text-white shadow">
                  ✕
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label className="neu-sm neu-press flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl text-muted">
                <span className="text-xl leading-none">＋</span>
                <span className="mt-1 text-[10px] font-bold">{t("画像を追加", "Add image")}</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addImages(e.target.files), (e.target.value = ""))} />
              </label>
            )}
          </div>
        </div>
        <p className="text-[11px] font-medium text-muted">
          {isSingleFile
            ? t("ダウンロード版からは送れません。サイト（pokepokeindex.com）から送ってください。", "Reports can't be sent from the downloaded version. Please use the website.")
            : t("送った内容はサイトの修正に使います。名前や連絡先などの個人情報は書かないでください。", "Reports are used to fix the site. Please don't include personal information.")}
        </p>
      </div>
    </Sheet>
  );
}
