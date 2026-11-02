import { font } from "@gugu/design-system";

/** Font files keyed by the family names used in design-system tokens (all include Vietnamese). */
export const FONT_SOURCES = {
  [font.ui]: require("../../assets/fonts/BeVietnamPro-Regular.ttf") as number,
  [font.uiMedium]: require("../../assets/fonts/BeVietnamPro-Medium.ttf") as number,
  [font.uiSemiBold]: require("../../assets/fonts/BeVietnamPro-SemiBold.ttf") as number,
  [font.display]: require("../../assets/fonts/NotoSerifDisplay-CondensedHeavy.ttf") as number,
  [font.serifBold]: require("../../assets/fonts/NotoSerifDisplay-Bold.ttf") as number,
  [font.serif]: require("../../assets/fonts/NotoSerifDisplay-Regular.ttf") as number,
  [font.script]: require("../../assets/fonts/PatrickHand-Regular.ttf") as number,
  [font.neon]: require("../../assets/fonts/BarlowCondensed-Regular.ttf") as number,
} satisfies Record<string, number>;
