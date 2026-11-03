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
