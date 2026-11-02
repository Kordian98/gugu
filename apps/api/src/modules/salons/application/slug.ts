import { randomBytes } from "node:crypto";

/** ASCII slug from a Vietnamese name: "Lotus Beauty Quận 1" → "lotus-beauty-quan-1". */
export function slugify(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return ascii || "salon";
}

/** Slug with a short random suffix so registrations never collide on popular names. */
export const uniqueSlug = (name: string): string =>
  `${slugify(name)}-${randomBytes(3).toString("hex")}`;
