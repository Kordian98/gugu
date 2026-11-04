import type { AppLocale } from "@gugu/localization";

import type { ScreenName } from "../screens";

/**
 * Where the phone crops may end on a whole row (fractions of the image height): the top of each
 * background-only band under a row of content, measured from the `m-*` captures (rerun after a
 * retake: rows whose pixels vary by less than 10 levels across the inner 90 % of the width). The
 * calendar has grid lines everywhere and ends on its fade instead.
 */
export const CUTS: Record<AppLocale, Partial<Record<ScreenName, readonly number[]>>> = {
  vi: {
    mAppointments: [0.281, 0.46, 0.636, 0.814, 0.993],
    mServices: [0.153, 0.29, 0.547, 0.8],
    mMonth: [0.205, 0.289, 0.316, 0.362, 0.463, 0.546, 0.698, 0.856, 0.972],
    mInsights: [0.342, 0.661, 0.98],
    mPayroll: [
      0.152, 0.154, 0.257, 0.29, 0.324, 0.413, 0.466, 0.468, 0.521, 0.526, 0.584, 0.627, 0.7, 0.705,
      0.75, 0.791, 0.868, 0.914, 0.955, 0.987, 0.988,
    ],
  },
  en: {
    mAppointments: [0.281, 0.46, 0.636, 0.814, 0.993],
    mServices: [0.222, 0.487, 0.74, 0.993],
    mMonth: [0.172, 0.246, 0.296, 0.349, 0.379, 0.444, 0.564, 0.665, 0.838, 0.963, 0.967],
    mInsights: [0.355, 0.669, 0.983],
    mPayroll: [
      0.152, 0.256, 0.264, 0.289, 0.297, 0.323, 0.413, 0.466, 0.468, 0.525, 0.591, 0.603, 0.627,
      0.704, 0.755, 0.792, 0.843, 0.863, 0.865, 0.919, 0.954, 0.987, 0.988,
    ],
  },
};
