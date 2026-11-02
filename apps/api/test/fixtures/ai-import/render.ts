import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Canary strings planted in test price lists. The PII suite fails if any of them (or any phone
 * number / email) appears in what is sent to the LLM gateway.
 */
export const CANARIES = {
  phone: "0912 345 678",
  phoneDigits: "0912345678",
  zalo: "0987.654.321",
  email: "canary.lotus@gmail.com",
  link: "fb.com/canarylotus",
  handle: "@canary_lotus",
  name: "Tuấn",
} as const;

export const PEOPLE_PHOTO = path.join(path.dirname(fileURLToPath(import.meta.url)), "people.jpg");

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Renders a price list as a PNG (system sans font), optionally with contact details and names. */
export async function renderPriceList(
  opts: { lines?: string[]; withPii?: boolean } = {},
): Promise<Buffer> {
  const lines = opts.lines ?? [
    "BẢNG GIÁ DỊCH VỤ - LOTUS NAIL",
    "Sơn gel tay ........ 150.000đ",
    "Cắt da + sơn thường ..... 80.000đ",
    "Nối mi classic (60 phút) ..... 350.000đ - 450.000đ",
    "Gội đầu dưỡng sinh 45p ..... 120k",
  ];
  const all = opts.withPii
    ? [
        ...lines,
        `Đắp bột: anh ${CANARIES.name} phụ trách ..... 250.000đ`,
        `Hotline: ${CANARIES.phone} - Zalo ${CANARIES.zalo}`,
        `Email: ${CANARIES.email}  ${CANARIES.link}`,
        `Instagram ${CANARIES.handle}`,
      ]
    : lines;
  let y = 64;
  const text = all
    .map((s, i) => {
      const size = i === 0 ? 34 : 26;
      const el = `<text x="40" y="${String(y)}" font-family="Arial, Helvetica, sans-serif" font-size="${String(size)}" fill="#222">${escape(s)}</text>`;
      y += size + 26;
      return el;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${String(y + 20)}"><rect width="100%" height="100%" fill="#fff8f0"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
