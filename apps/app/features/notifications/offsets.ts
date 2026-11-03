import type { TFunction } from "i18next";

/** Reminder moments offered in Settings → Notifications (minutes before the start). */
export const OFFSET_CHOICES = [30, 60, 120, 180, 360, 720, 1440, 2880, 4320, 10080] as const;

/** 30 → "30 phút"; 120 → "2 giờ"; 1440 → "24 giờ"; 2880 → "2 ngày". */
export function offsetLabel(minutes: number, t: TFunction<"notifications">): string {
  if (minutes >= 2880 && minutes % 1440 === 0) {
    return t("panel.offset.days", { count: minutes / 1440 });
  }
  if (minutes % 60 === 0) return t("panel.offset.hours", { count: minutes / 60 });
  return t("panel.offset.minutes", { count: minutes });
}
