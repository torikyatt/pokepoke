// お問い合わせフォーム（設定画面から開く）。送ると contact@pokepokeindex.com に届き、
// 入力されたアドレスには noreply@ から受け付けた知らせが自動で届く（functions/api/contact.ts）
import { useEffect, useRef, useState } from "react";
import { isSingleFile } from "../data/load.ts";
import { useLang, useT } from "../i18n.ts";
import { useToast } from "../store.ts";
import { Sheet } from "./ui.tsx";

/** 種類（キーはサーバーの CONTACT_CATEGORIES と同じ） */
const CATEGORIES: [string, string, string][] = [
  ["feedback", "ご意見・ご要望", "Feedback / requests"],
  ["bug", "不具合", "Bug"],
  ["data", "カード・データの誤り", "Wrong card data"],
  ["other", "その他", "Other"],
];
const MAX_CHARS = 1000;
/** Cloudflare Turnstile（ロボットよけ）のサイトキー（公開してよいもの）。空なら使わない */
const TURNSTILE_SITEKEY = "0x4AAAAAAFO0qpdf7Gu5zp-I";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
let turnstileLoading: Promise<Turnstile> | undefined;
/** Turnstile のスクリプトを1回だけ読む（フォームを開いたときだけ） */
function loadTurnstile(): Promise<Turnstile> {
  const w = window as unknown as { turnstile?: Turnstile };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  turnstileLoading ??= new Promise((ok, ng) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (w.turnstile ? ok(w.turnstile) : ng(new Error("turnstile")));
    s.onerror = () => {
      turnstileLoading = undefined;
      ng(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return turnstileLoading;
}
const EMAIL = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;

export function ContactSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const show = useToast((s) => s.show);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("feedback");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState(""); // ロボットよけ（人には見えない）
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ t: Turnstile; id: string }>(undefined);
  const useTurnstile = !!TURNSTILE_SITEKEY && !isSingleFile;
  useEffect(() => {
    if (open) setWebsite("");
  }, [open]);
  // ロボットよけの確認欄（開いている間だけ置く）
  useEffect(() => {
    if (!open || !useTurnstile) return;
    let gone = false;
    setToken("");
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current) return;
        const id = ts.render(box.current, {
          sitekey: TURNSTILE_SITEKEY,
          language: lang,
          theme: "light",
          size: "flexible",
          callback: (v: string) => setToken(v),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
        widget.current = { t: ts, id };
      })
      .catch(() => show(t("確認の読み込みに失敗しました。通信状況をご確認ください", "Couldn't load the verification. Please check your connection."), "error"));
    return () => {
      gone = true;
      if (widget.current) widget.current.t.remove(widget.current.id);
      widget.current = undefined;
    };
  }, [open, useTurnstile, lang]);
  const chars = [...body].length;
  const emailOk = EMAIL.test(email.trim());
  const canSend = !sending && !isSingleFile && emailOk && body.trim() !== "" && chars <= MAX_CHARS && (!useTurnstile || token !== "");

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email: email.trim(), category, body, lang, website, turnstile: token }) });
      if (!res.ok) throw new Error(String(res.status));
      show(t("お問い合わせを送りました。ありがとうございます！", "Message sent. Thank you!"));
      setBody("");
      onClose();
    } catch {
      show(t("送れませんでした。お手数ですが、時間をおいてもう一度お試しください", "Couldn't send. Please try again later."), "error");
      // 確認の印は1回しか使えないので、やり直せるように確認欄を新しくする
      if (widget.current) widget.current.t.reset(widget.current.id);
      setToken("");
    } finally {
      setSending(false);
    }
  };

  const field = "neu-in w-full rounded-2xl px-3 py-2.5 text-sm font-bold outline-none";
  const label = "mb-1 block text-xs font-extrabold text-muted";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("お問い合わせ", "Contact")}
      z="z-[60]"
      footer={
        <button type="button" disabled={!canSend} onClick={send} className="btn-ok w-full rounded-full py-3 text-base disabled:opacity-40">
          {sending ? t("送信中…", "Sending…") : t("送信する", "Send")}
        </button>
      }
    >
      <div className="space-y-4 pt-1 pb-2">
        <p className="text-xs font-medium text-muted">
          {t(
            "ご意見・ご要望・不具合などをお寄せください。カードごとの誤りは、カード詳細の左上の旗のボタンからもお知らせいただけます。",
            "Send us feedback, requests or bug reports. Errors in a specific card can also be reported with the flag button at the top left of its details.",
          )}
        </p>
        <label className="block">
          <span className={label}>{t("お名前（任意・ニックネーム可）", "Name (optional)")}</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" className={field} />
        </label>
        <label className="block">
          <span className={label}>{t("メールアドレス（お返事用）", "Email (for our reply)")}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" inputMode="email" placeholder="you@example.com" className={field} />
          {email.trim() !== "" && !emailOk && <span className="mt-1 block text-[11px] font-bold text-[#c4302b]">{t("メールアドレスの形をご確認ください", "Please check the email address")}</span>}
        </label>
        <label className="block">
          <span className={label}>{t("種類", "Type")}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
            {CATEGORIES.map(([k, ja, en]) => (
              <option key={k} value={k}>
                {lang === "en" ? en : ja}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={`${label} flex items-baseline justify-between`}>
            <span>{t("内容", "Message")}</span>
            <span className={`tabular-nums ${chars > MAX_CHARS ? "text-[#c4302b]" : ""}`}>
              {chars} / {MAX_CHARS}
            </span>
          </span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={`${field} resize-none font-medium`} />
        </label>
        {useTurnstile && <div ref={box} className="min-h-[65px]" />}
        {/* ロボットよけ: 人には見えない欄。ここに何か入っていたら送らない */}
        <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <p className="text-[11px] font-medium text-muted">
          {isSingleFile
            ? t("ダウンロード版からは送れません。お手数ですが、サイト（pokepokeindex.com）からお送りください。", "Messages can't be sent from the downloaded version. Please use the website.")
            : t(
                "送信すると、ご入力のアドレスに受け付けのお知らせが自動で届きます。メールアドレスはお返事のためだけに使います。お返事までお時間をいただくことや、内容によってはお返事できないこともございます。",
                "After sending, an automatic confirmation is sent to your address. We use your email only to reply. Replies may take time, and we may not be able to reply to every message.",
              )}
        </p>
      </div>
    </Sheet>
  );
}
