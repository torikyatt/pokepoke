// 英語のカード画像（PocketDecks のもの）を自前で置く場所（public/cards-en/<収録ID>.webp）と、元の URL
export const enImageFile = (printId: string) => `cards-en/${printId}.webp`;
export const enImageRemote = (printId: string) => {
  const at = printId.lastIndexOf("-");
  return `https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/cards/${printId.slice(0, at)}/${printId.slice(at + 1)}.webp`;
};
