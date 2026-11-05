# Mobile editor interactions — 2026-11-05

Shared CRM editors now keep their header and action footer inside the available height. The phone sheet uses a bounded flex layout instead of combining a 92% height with a 48-point top margin. This matters on small screens, in landscape and when the native keyboard reduces the usable area.

## Implemented behavior

- The top edge respects the safe-area inset. A sheet without a footer also gives its last field bottom safe-area space.
- `KeyboardAvoidingView` remains the only keyboard-inset owner. Footer home-indicator padding is removed while the keyboard is present, rather than adding it to the keyboard inset.
- Native editors show a translated, 44-point “Hide keyboard” action above their footer when the keyboard opens. It also works for a number pad without a Return key.
- Screen-level ScrollViews hosting CRM editors also preserve handled keyboard taps. React Native's default ancestor capture consumed the first Save tap even though the sheet's own ScrollView already used `handled`; its Modal stops bubbling but does not prevent ancestor capture. This was reproduced and fixed on the native simulator, without executing saves on touch-down.
- Single-line inputs use Done and blur on submission; multiline inputs retain newline entry.
- iOS body scrolling dismisses the keyboard interactively; Android uses drag dismissal. Handled taps are preserved, so fields and buttons do not require a preliminary keyboard-dismiss tap.
- A deliberate downward drag on the header hides the keyboard. It never closes the editor or discards values. The body scroll and form fields do not own this gesture.
- Native Back/backdrop first hides an open keyboard. Explicit close still obeys the existing pending-write lock. Backdrop, close and hardware dismissal cannot close a pending write.
- Sheets and destructive confirmation dialogs disable their fade when reduced motion is enabled.
- The existing web Select Escape handling and focus restoration are unchanged.

Implementation: `apps/app/features/salon-crm/ui/form.tsx` and `apps/app/features/salon-crm/ui/useSheetKeyboard.ts`. No additional dependencies.

## Validation and limits

- Focused ESLint passes with zero errors. The existing large form module retains size/complexity warnings.
- App typecheck passed immediately after the first form edit; a subsequent concurrent run reported a nullable summary in the separate walk-in implementation, handed to its owner. The final combined gate belongs to the orchestrator.
- The orchestrator's production browser regression passed 6/6 on Chromium and WebKit. `e2e/web/tests/mobile-usability.spec.ts` asserts sheet/footer bounds at 320×568 and 390×420, preserving edited values and Select Escape/focus restoration in vi and en. Week navigation/44-point targets and the existing flexible booking journeys also passed.
- The native agent ran the actual app on an iPhone 17 Pro simulator with iOS 26.4. Maestro confirmed numeric entry (`280000`) with the native number pad, Save visible above the keyboard, the hide-keyboard button dismissing it while preserving the draft, and a downward header swipe dismissing only the keyboard while the editor and draft remained. Screenshots are in `docs/qa/07-mobile-feel/screenshots/`.
- The initial one-tap Save check exposed ancestor ScrollView capture: the first tap only dismissed the keyboard. After the screen-level fix, Maestro confirmed that **one Save tap with the number pad visible closes the sheet**, then reopening the editor showed the persisted `285000` value. The service editor also now locks dismissal and its Save/Cancel/Delete actions while saving.
- Browser and iOS simulator checks do not establish Android behavior or physical-device comfort; Android tooling was unavailable in this environment.

The implementation avoids `InputAccessoryView`: [React Native's API documentation](https://reactnative.dev/docs/inputaccessoryview) marks it deprecated and documents limitations with multiline inputs and bottom tabs. A visible editor action provides the number-pad escape path without that dependency.

## Native-discovered login recovery

The simulator exposed a separate lifecycle bug: after a rejected/expired magic link, opening a fresh token on the same mounted verification route did nothing because `VerifyScreen` remembered only a boolean “started”. The failure state also belonged to the whole screen rather than the token.

`VerifyScreen.tsx` now associates rejection with the current token and uses `tokenVerification.ts` to reuse each active token's exchange across effect rerenders. On a new token, it detaches prior navigation/error callbacks and starts another exchange. Exchanges are serialized because `auth.verify` also installs the session: an older response must finish applying before the newer session is installed. No session-storage, authorization, redirect-policy, token validation or API changes were made.

Focused validation: `tokenVerification.test.ts` **4/4 passed** (expired→fresh recovery, effect replay without duplicate exchange, old late success, old late failure), auth-file ESLint **0 errors**, app typecheck **passed**. The native tester owns the same-route fresh-link runtime confirmation.

## Native acceptance checklist

1. Open a service editor and focus a numeric price field. The keyboard action and save footer remain visible, with no duplicated bottom gap.
2. Change the price and tap Save once with the keyboard open. Exactly one write succeeds.
3. Enter an unsaved value, drag the header down, and check that only the keyboard closes and the value remains.
4. Tap the hide-keyboard action with the number pad open; repeat with a multiline field and interactive body scrolling.
5. During a delayed save, attempt backdrop, X and Back dismissal. The editor stays open until the mutation resolves.
6. Repeat on Android; verify window resizing does not add a second keyboard-height gap.
