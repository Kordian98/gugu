# Native mobile verification — 2026-11-05

Actual native iOS build and runtime, separate from browser viewport emulation.

## Environment and build

- Xcode 26.4.1 (17E202), CocoaPods 1.17.0.
- iPhone 17 Pro simulator, iOS 26.4, 402 × 874 pt.
- Expo 58.0.22 / React Native 0.88.1, generated development application `vn.gugu.app.dev`.
- `expo prebuild --platform ios --no-install`, `pod install`, `expo run:ios --device <simulator-udid> --no-bundler --no-install`: build succeeded with zero errors and one upstream Expo module visibility warning. No dependency/configuration changes were needed. Generated `apps/app/ios` remains ignored.
- Metro on 8481, isolated API on 3470, Mailpit on 18025, database `gugu_crm_audit`. Fictional salon `Lotus E2E mobile feel-native`; its timezone was changed to `Etc/UTC` solely to make an in-hours walk-in available during the evening test. Device clock was not changed.
- Maestro 2.12.1 drove real simulator taps, scrolls, text input and gestures through its iOS driver. It was downloaded to temporary storage, not added to project dependencies.

## Verified and fixed on native iOS

| Check | Result |
| --- | --- |
| Actual application build, install, launch and authenticated CRM | Pass after fixing `PageHeader`: browser document title `<Head>` is web-only. Unconditional rendering previously crashed every native CRM page with an Expo handoff-origin error. |
| System number-pad input | Pass: entered `280000` and subsequently `285000` in the service price field. |
| Footer reachable above keyboard | Pass: Save and Hide keyboard remain visible and touchable above the real iOS number pad. |
| Hide keyboard button | Pass: dismisses keyboard, retains entered price and open editor. |
| Downward gesture on sheet header | Pass: 500 ms drag from 45%,11% to 45%,18% dismisses keyboard and retains price/editor. |
| Scroll to lower form field | Pass: service price reached by native scrolling. |
| Single Save tap while keyboard is visible | Initially failed: first tap only hid keyboard. Fixed by setting `keyboardShouldPersistTaps="handled"` on the enclosing Services page ScrollView. Retest passed: one Save tap closed editor, reopening displayed persisted `285000`. |
| CRM safe areas and status-bar contrast | Sheet starts below the status bar; footer above home area. Native capture exposed black status icons on plum header; corrected to light status-bar style. |
| Quick walk-in | Pass after final-source cold start: tap Walk-in → tap service → tap enabled Confirm. No typing, customer creation, calendar visit or staff selection. Native appointment detail showed Confirmed / Walk-in. Database verification found exactly one new `source=walk_in`, `status=confirmed` row; the two seed bookings were unchanged. |
| Fresh magic link on the same Verify route | Pass: opened a deliberately invalid token and asserted the failure page; opened a new local-Mailpit link without leaving the route or restarting; CRM appeared and failure text disappeared. |

Evidence: [number pad and reachable footer](screenshots/ios-number-keyboard.png), [draft retained after keyboard drag](screenshots/ios-draft-after-keyboard-drag.png), [confirmed native walk-in](screenshots/ios-walk-in-confirmed.png).

Sanitized repeatable checks: [service keyboard flow](native-flows/service-keyboard.yaml) and [walk-in flow](native-flows/walk-in.yaml). Start signed in on the appropriate English page of a disposable salon. The first flow edits the `Gel polish` fixture price; the second takes `SERVICE_OPTION_ID` from the fixture and creates a booking. Neither contains credentials or tokens. The service flow combines the separately executed keyboard/gesture and save-persistence sequences; the walk-in sequence was executed together after final-source cold start.

Walk-in evidence: appointment `WTE-ST3`, 2026-11-05 17:30–18:15 UTC, Women's haircut, Trần Mai, estimated 200,000đ. The backend row was created at 16:17:27.386 UTC. Earlier attempts during source updates did not create bookings and are not counted as passes.

## Coverage limits and separate findings

- Android native execution is unavailable in this environment: `adb` and `emulator` absent from PATH, neither binary exists under `~/Library/Android/sdk`, no Homebrew command-line-tools directory, and neither `ANDROID_HOME` nor `ANDROID_SDK_ROOT` is set. Android browser viewport testing is not an Android native pass.
- This is an iOS simulator debug build, not a physical iPhone or release-performance benchmark. No FPS, latency, haptics, real Android Back, or physical-device keyboard claims.
- Public marketing landing header overlaps the iOS status bar/Dynamic Island. Recorded separately from this CRM interaction change.
- Reopening a new magic-link token while the previous Verify route remained mounted exposed a retry issue; fixed in the companion auth change, covered by focused regression tests, and retested successfully on native iOS above.
