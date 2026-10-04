/// <reference types="vite/client" />

declare const __SINGLE__: boolean;

declare module "virtual:app-data" {
  const base64Gzip: string;
  export default base64Gzip;
}

declare module "virtual:thumbs" {
  // 単一HTML版だけ: カードID → WebP の base64。Web版は null
  const thumbs: Record<string, string> | null;
  export default thumbs;
}
