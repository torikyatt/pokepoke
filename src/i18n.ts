// 表示言語（日本語・英語）。画面の文字は、その場で t("日本語", "English") のように両方書く。
// カード名・効果文・タグ名など、データ側の文字はここの関数で言語に合わせて選ぶ
import { useCallback } from "react";
import { useSettings } from "./store.ts";
import type { AppCard, AppEffect, AppSet, AppTag, CardGroup, CardKind, EnergyType, Rule, Stage } from "./types.ts";
import { GROUP_EN, GROUP_JA, KIND_EN, KIND_JA, RULE_EN, RULE_JA, STAGE_EN, STAGE_JA, TYPE_EN, TYPE_JA } from "./types.ts";
export { GROUP_EN, KIND_EN, RULE_EN, STAGE_EN, TYPE_EN };

export type Lang = "ja" | "en";
export type T = (ja: string, en: string) => string;

export const useLang = (): Lang => useSettings((s) => s.lang);
/** React の外（ストア・トースト）で使うとき */
export const getLang = (): Lang => useSettings.getState().lang;
export const tr: T = (ja, en) => (getLang() === "en" ? en : ja);

export function useT(): T {
  const lang = useLang();
  return useCallback((ja: string, en: string) => (lang === "en" ? en : ja), [lang]);
}

export const typeName = (t: EnergyType, lang: Lang) => (lang === "en" ? TYPE_EN : TYPE_JA)[t];
export const kindName = (k: CardKind, lang: Lang) => (lang === "en" ? KIND_EN : KIND_JA)[k];
export const stageName = (s: Stage, lang: Lang) => (lang === "en" ? STAGE_EN : STAGE_JA)[s];
export const ruleName = (r: Rule, lang: Lang) => (lang === "en" ? RULE_EN : RULE_JA)[r];
export const groupName = (g: CardGroup, lang: Lang) => (lang === "en" ? GROUP_EN : GROUP_JA)[g];

export const cardName = (c: Pick<AppCard, "nameJa" | "nameEn">, lang: Lang) => (lang === "en" ? c.nameEn || c.nameJa : c.nameJa || c.nameEn);
export const effectName = (e: AppEffect, lang: Lang) => (lang === "en" ? e.nameEn ?? e.nameJa : e.nameJa ?? e.nameEn) ?? "";
/** 効果文。日本語が仮訳（機械翻訳）なら machine を返す。英語は原文 */
export const effectText = (e: AppEffect, lang: Lang) =>
  lang === "en" ? { text: e.textEn ?? e.textJa ?? "", machine: false } : { text: e.textJa ?? e.textEn ?? "", machine: !!e.machine };
export const tagName = (t: AppTag | undefined, lang: Lang, fallback = "") => (t ? (lang === "en" ? t.en ?? t.ja : t.ja) : fallback);
export const setName = (s: AppSet | undefined, lang: Lang, fallback = "") => (s ? (lang === "en" ? s.name : s.nameJa || s.name) : fallback);

/** 日付（言語に合わせた書き方） */
export const dateStr = (d: Date | string | number, lang: Lang) => new Date(d).toLocaleDateString(lang === "en" ? "en-US" : "ja-JP");

/** サイトのタイトル（タブ・共有） */
export const siteTitle = (lang: Lang) => (lang === "en" ? "POKÉPOKE INDECKS – Pokémon TCG Pocket Card Search & Deck Builder" : "POKÉPOKE INDECKS｜ポケポケのカード図鑑");
