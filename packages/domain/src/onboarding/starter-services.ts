import type { BusinessType } from "@gugu/contracts";

/**
 * Starter service templates for the setup wizard (step c, path B). Typical Vietnamese salon services
 * with editable durations and price ranges in VND (indicative, 2026 city prices). Nothing here is
 * saved until the owner confirms the list in the wizard.
 */
export interface StarterService {
  /** Stable key (analytics, React keys); never shown. */
  key: string;
  name: { vi: string; en: string };
  durationMinutes: number;
  price: number;
  /** Upper end of the usual price range; null for a fixed price. */
  priceMax: number | null;
}

const k = 1_000;

const S = {
  manicure: {
    name: { vi: "Cắt da, sửa móng tay", en: "Manicure clean-up" },
    durationMinutes: 30,
    price: 60 * k,
    priceMax: 80 * k,
  },
  gelHands: {
    name: { vi: "Sơn gel tay", en: "Gel polish (hands)" },
    durationMinutes: 45,
    price: 120 * k,
    priceMax: 180 * k,
  },
  gelFeet: {
    name: { vi: "Sơn gel chân", en: "Gel polish (feet)" },
    durationMinutes: 45,
    price: 120 * k,
    priceMax: 180 * k,
  },
  gelExt: {
    name: { vi: "Úp móng gel", en: "Gel extensions" },
    durationMinutes: 75,
    price: 250 * k,
    priceMax: 400 * k,
  },
  acrylic: {
    name: { vi: "Đắp bột", en: "Acrylic nails" },
    durationMinutes: 90,
    price: 300 * k,
    priceMax: 450 * k,
  },
  gelOff: {
    name: { vi: "Phá gel", en: "Gel removal" },
    durationMinutes: 20,
    price: 30 * k,
    priceMax: 50 * k,
  },
  pedicure: {
    name: { vi: "Chăm sóc da chân", en: "Pedicure spa" },
    durationMinutes: 45,
    price: 150 * k,
    priceMax: 250 * k,
  },
  cutWomen: {
    name: { vi: "Cắt tóc nữ", en: "Women's haircut" },
    durationMinutes: 45,
    price: 100 * k,
    priceMax: 200 * k,
  },
  cutMen: {
    name: { vi: "Cắt tóc nam", en: "Men's haircut" },
    durationMinutes: 30,
    price: 60 * k,
    priceMax: 120 * k,
  },
  washDry: {
    name: { vi: "Gội sấy", en: "Wash & blow-dry" },
    durationMinutes: 30,
    price: 60 * k,
    priceMax: 100 * k,
  },
  colour: {
    name: { vi: "Nhuộm tóc", en: "Hair colour" },
    durationMinutes: 120,
    price: 400 * k,
    priceMax: 900 * k,
  },
  perm: {
    name: { vi: "Uốn tóc", en: "Perm" },
    durationMinutes: 150,
    price: 500 * k,
    priceMax: 1_200 * k,
  },
  straighten: {
    name: { vi: "Duỗi tóc", en: "Hair straightening" },
    durationMinutes: 150,
    price: 500 * k,
    priceMax: 1_200 * k,
  },
  hairTreatment: {
    name: { vi: "Phục hồi tóc", en: "Hair treatment" },
    durationMinutes: 60,
    price: 300 * k,
    priceMax: 600 * k,
  },
  bodyMassage: {
    name: { vi: "Massage body", en: "Full body massage" },
    durationMinutes: 60,
    price: 250 * k,
    priceMax: 400 * k,
  },
  footMassage: {
    name: { vi: "Massage chân", en: "Foot massage" },
    durationMinutes: 45,
    price: 150 * k,
    priceMax: 250 * k,
  },
  headSpa: {
    name: { vi: "Gội đầu dưỡng sinh", en: "Herbal head spa" },
    durationMinutes: 60,
    price: 120 * k,
    priceMax: 200 * k,
  },
  facial: {
    name: { vi: "Chăm sóc da mặt cơ bản", en: "Basic facial" },
    durationMinutes: 60,
    price: 250 * k,
    priceMax: 400 * k,
  },
  acne: {
    name: { vi: "Lấy nhân mụn", en: "Acne extraction" },
    durationMinutes: 60,
    price: 200 * k,
    priceMax: 350 * k,
  },
  bodyScrub: {
    name: { vi: "Tẩy tế bào chết toàn thân", en: "Body scrub" },
    durationMinutes: 45,
    price: 200 * k,
    priceMax: 350 * k,
  },
  lashClassic: {
    name: { vi: "Nối mi classic", en: "Classic lash extensions" },
    durationMinutes: 90,
    price: 250 * k,
    priceMax: 350 * k,
  },
  lashVolume: {
    name: { vi: "Nối mi volume", en: "Volume lash extensions" },
    durationMinutes: 120,
    price: 350 * k,
    priceMax: 550 * k,
  },
  lashRefill: {
    name: { vi: "Dặm mi", en: "Lash refill" },
    durationMinutes: 60,
    price: 150 * k,
    priceMax: 250 * k,
  },
  lashLift: {
    name: { vi: "Uốn mi", en: "Lash lift" },
    durationMinutes: 60,
    price: 200 * k,
    priceMax: 300 * k,
  },
  lashOff: {
    name: { vi: "Tháo mi", en: "Lash removal" },
    durationMinutes: 20,
    price: 50 * k,
    priceMax: null,
  },
  browShape: {
    name: { vi: "Tạo dáng chân mày", en: "Brow shaping" },
    durationMinutes: 30,
    price: 80 * k,
    priceMax: 150 * k,
  },
  microblading: {
    name: { vi: "Điêu khắc chân mày", en: "Microblading" },
    durationMinutes: 120,
    price: 1_500 * k,
    priceMax: 3_000 * k,
  },
} satisfies Record<string, Omit<StarterService, "key">>;

type Key = keyof typeof S;

const LISTS: Record<BusinessType, Key[]> = {
  nails: ["manicure", "gelHands", "gelFeet", "gelExt", "acrylic", "gelOff", "pedicure"],
  hair: ["cutWomen", "cutMen", "washDry", "colour", "perm", "straighten", "hairTreatment"],
  spa: ["bodyMassage", "footMassage", "headSpa", "facial", "acne", "bodyScrub"],
  lashes_brows: [
    "lashClassic",
    "lashVolume",
    "lashRefill",
    "lashLift",
    "lashOff",
    "browShape",
    "microblading",
  ],
  mixed: [
    "gelHands",
    "manicure",
    "washDry",
    "cutWomen",
    "headSpa",
    "facial",
    "lashClassic",
    "browShape",
  ],
};

/** The template list for a business type (fresh objects; safe to edit). */
export function starterServices(type: BusinessType): StarterService[] {
  return LISTS[type].map((key) => ({ key, ...S[key], name: { ...S[key].name } }));
}
