// /l/<共有コード> … リストの共有リンク（日本語）。中身は server/list-page.ts
import { listPage } from "../../server/list-page.ts";

export const onRequestGet = (ctx: Parameters<typeof listPage>[0]) => listPage(ctx, "ja");
