import type { AppLocale } from "@gugu/localization";

export const CATEGORY_IDS = ["nails", "hair", "skin", "brows", "lashes", "massage"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export type DemoSalon = {
  slug: string;
  name: string;
  rating: number;
  reviews: number;
  area: Record<AppLocale, string>;
  priceFrom: number;
  image: number;
};

/**
 * DEMO DATA — mirrors the reference mock until the search API exists (topic 10). Cards show a "Demo" badge.
 * Area labels copy the reference; production uses post-2025 area labels (topic 10 §3.6.1).
 */
export const DEMO_SALONS: DemoSalon[] = [
  {
    slug: "luna-nail-studio",
    name: "Luna Nail Studio",
    rating: 4.9,
    reviews: 320,
    area: { en: "District 1, HCMC", vi: "Quận 1, TP.HCM" },
    priceFrom: 300000,
    image: 0,
  },
  {
    slug: "the-hair-room",
    name: "The Hair Room",
    rating: 4.8,
    reviews: 184,
    area: { en: "Thao Dien, HCMC", vi: "Thảo Điền, TP.HCM" },
    priceFrom: 450000,
    image: 1,
  },
  {
    slug: "glow-lab",
    name: "Glow Lab",
    rating: 4.9,
    reviews: 276,
    area: { en: "District 3, HCMC", vi: "Quận 3, TP.HCM" },
    priceFrom: 350000,
    image: 2,
  },
  {
    slug: "browtique",
    name: "Browtique",
    rating: 4.8,
    reviews: 190,
    area: { en: "Phu Nhuan, HCMC", vi: "Phú Nhuận, TP.HCM" },
    priceFrom: 250000,
    image: 3,
  },
  {
    slug: "skin-journal",
    name: "Skin Journal",
    rating: 4.9,
    reviews: 412,
    area: { en: "District 1, HCMC", vi: "Quận 1, TP.HCM" },
    priceFrom: 500000,
    image: 4,
  },
  {
    slug: "rosie-nail-bar",
    name: "Rosie Nail Bar",
    rating: 4.7,
    reviews: 158,
    area: { en: "Binh Thanh, HCMC", vi: "Bình Thạnh, TP.HCM" },
    priceFrom: 200000,
    image: 5,
  },
  {
    slug: "maison-hair",
    name: "Maison Hair",
    rating: 4.8,
    reviews: 233,
    area: { en: "Tan Dinh, HCMC", vi: "Tân Định, TP.HCM" },
    priceFrom: 400000,
    image: 6,
  },
  {
    slug: "lotus-day-spa",
    name: "Lotus Day Spa",
    rating: 4.9,
    reviews: 301,
    area: { en: "Hoan Kiem, Hanoi", vi: "Hoàn Kiếm, Hà Nội" },
    priceFrom: 450000,
    image: 7,
  },
];

/** Default values shown in the hero search card (topic 10 §3.3 search card mapping). */
export const SEARCH_DEFAULTS = {
  category: "nails",
  province: "ho-chi-minh",
  when: "today",
} as const;
