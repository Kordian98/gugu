import type { AccessibilityRole, Role } from "react-native";

export type CheckableRole = "switch" | "checkbox" | "radio";

export type CheckableA11yProps = {
  role: Role;
  accessibilityRole: AccessibilityRole;
  accessibilityState: { checked: boolean; disabled?: boolean };
  "aria-checked": boolean;
  "aria-disabled"?: boolean;
};

/**
 * Accessibility props for a pressable that toggles (switch, checkbox, radio). react-native-web
 * ignores `accessibilityState.checked`, so screen readers on web never heard the state; the ARIA
 * props (`role` + `aria-checked`) work on web and native alike. Spread it on the `Pressable`
 * instead of setting `accessibilityRole` / `accessibilityState` by hand.
 */
export function checkableA11y(
  role: CheckableRole,
  checked: boolean,
  opts: { disabled?: boolean } = {},
): CheckableA11yProps {
  const props: CheckableA11yProps = {
    role,
    accessibilityRole: role,
    accessibilityState: { checked },
    "aria-checked": checked,
  };
  if (opts.disabled !== undefined) {
    props.accessibilityState.disabled = opts.disabled;
    props["aria-disabled"] = opts.disabled;
  }
  return props;
}

/** Minimum touch target (WCAG 2.5.5 / platform guidance): 44 pt. */
export const MIN_TOUCH = 44;

/**
 * How much a control that is visually smaller than 44 pt must grow on each side to reach a 44 pt
 * touch area. Make the pressable that much bigger and cancel it with a negative margin, so the
 * layout footprint is unchanged (react-native-web ignores `hitSlop`). See `CalmButton`, `Toggle`.
 */
export function touchSlop(
  width: number,
  height: number,
): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const v = Math.max(0, Math.ceil((MIN_TOUCH - height) / 2));
  const h = Math.max(0, Math.ceil((MIN_TOUCH - width) / 2));
  return { top: v, bottom: v, left: h, right: h };
}
