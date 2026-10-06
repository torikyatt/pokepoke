// /d/<共有コード> … デッキの共有リンク（日本語）。中身は server/deck-page.ts
import { deckPage } from "../../server/deck-page.ts";

export const onRequestGet = (ctx: Parameters<typeof deckPage>[0]) => deckPage(ctx, "ja");
