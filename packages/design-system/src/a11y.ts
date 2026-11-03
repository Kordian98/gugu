/**
 * Accessibility props for a checkable control (radio / checkbox / switch) that work on native and web:
 * RN `accessibilityState` plus the ARIA attribute React Native Web forwards to the DOM.
 */
export function checkableA11y(checked: boolean) {
  return { accessibilityState: { checked }, "aria-checked": checked } as const;
}
