# CRM SaaS mobile audit — 2026-11-05

Mobile audit of the real local Expo web app and isolated NestJS API, with deterministic salon data. The product is useful for daily salon work, but the initial service list was unreadable on a phone even though the page had no horizontal overflow. The implemented changes prioritize readable customer/service identity, reliable forms, clear loading failures, and reachable controls.

## Coverage and evidence

- Initial pass: Chromium with Pixel 7 emulation, 412 CSS px, Vietnamese/light, all 12 workspace destinations below. `mobile/chromium-before.json` and `mobile/chromium-before-*.png`.
- After pass: same 12 destinations, Chromium/Pixel 7, Vietnamese/light. `mobile/chromium-after.json` and screenshots.
- Second after pass: WebKit with iPhone 13 emulation, 390 CSS px, English/dark, all 12 destinations. `mobile/webkit-after-dark.json` and screenshots.
- Focused interaction matrix: Chromium and WebKit, Vietnamese and English, 360 × 780 CSS px. All four combinations passed service-name readability, common input sizing, editor category expand/collapse, Escape/focus restoration, calendar navigation sizing, dark rendering, simulated initial booking-read failure, and retry recovery. `mobile/functional-results.json`.
- Committed regression: `e2e/web/tests/mobile-usability.spec.ts` covers the same most important controls in both locales and now includes Escape and initial failure recovery. The root agent owns final production-export test results.
- This is mobile **browser** emulation, not native device validation. An iPhone 17 Pro simulator with iOS 26.4 exists, but no GuGu development app is installed; installed Expo Go is SDK 54 while this repository uses SDK 58. Android adb/emulator are absent from PATH and the usual SDK installation directory. Native keyboard avoidance is implemented but unverified on-device.

The route passes inspect loaded content, screenshots, document width, visible button/tab/radio boxes, and shared input font sizes. They do not prove every action in every module. After fixes these inspected controls had no target smaller than 44 CSS px and no document overflow in either route pass. This is not a claim that all nested editor controls, date cells, checkboxes, or screen-reader flows have been exhaustively checked.

| Destination | Runtime coverage |
| --- | --- |
| Today | Loaded populated workspace; navigation and top-level controls |
| Calendar | Agenda, staff switcher, date controls, readable client/service text, error/retry, dark |
| Appointments | Loaded list and layout; shared agenda component |
| Customers | Directory/search layout; shared fields and segment controls |
| Services | List and editor; full names, prices and staff visible; inline category interaction |
| Team | Loaded team; shared editor components inspected in source |
| Resources | Loaded state and layout; domain agent separately checks mutation safety |
| Insights | Loaded metrics and period controls; error handling owned by domain agent |
| Payroll | Month summary/cards loaded; root owns payroll behavior tests |
| Settings | Profile/hours/booking/appearance/language layout and common controls |
| Zalo | Disconnected/local-provider state; no real OA traffic |
| Setup | Focused wizard landing and navigation layout; AI provider not configured locally |

## Findings and fixes

| Priority | Finding and reproduction | Change |
| --- | --- | --- |
| P1 | Services on a 412 px phone: name and duration reduced to one letter because price, avatars, toggle, reorder and delete all shared a row. The page still passed overflow checks. | `ServiceRow.tsx`: mobile cards give names and service details full width; separate controls have 44 px targets; desktop remains a row. Regression tests check actual text box width/clipping. |
| P1 | Agenda used time/avatar/identity/price/status in one row. At phone widths service/staff details were truncated. | `AgendaList.tsx`: mobile names and service/staff wrap, price/status occupy a separate row; name uses body typography. |
| P1 | Shared input fields were 15 px and 42 px tall. This is too small for the project's phone-first control rules. | `ui/form.tsx`: body typography 16 px and minimum 44 px inputs; applies across CRM forms. |
| P1 | Shared Sheet had no native keyboard avoidance; action rows did not wrap. | KeyboardAvoidingView for native and wrapping footer/confirmation actions. Browser layouts verified; native keyboard behavior still requires a compatible build. |
| P1 | Category Select opened a second modal inside the service editor, violating the one-sheet workflow. | Inline radio choices; trigger announces expansion. Selection restores focus. Escape is consumed on keydown and keyup before React Native Web's modal handler, closes choices and preserves editor. Tested in Chromium and WebKit. |
| P1 | Calendar booking/team/settings failure could look like an empty calendar. | `CalendarScreen.tsx`: retry error for initial failure; background failure keeps cached calendar visible with error above it. Initial 503/retry runtime-tested; cached-state preservation reviewed in code. |
| P2 | Calendar arrows 34 px, staff tabs 36 px, service reorder/delete 28 px, notification bell 40 px, common segments 36 px, sheet close 36 px and confirmation buttons 40 px. | Minimum44 controls using design-system MIN_TOUCH; common form correction covers several screens. Root/domain agent corrected customer filters and settings choices. |
| P2 | Appointment available-slot buttons were 38 px. | `SlotPicker.tsx`: minimum44. Root also owns remaining booking add-on/earliest-slot target corrections. |
| P2 | Confirmation could be dismissed while mutation was pending. | Shared ConfirmDialog disables cancellation/Android-back dismissal while busy. |

## Useful behavior retained

Today is the landing screen, the bottom bar keeps Today/Calendar/Customers and New nearby, and secondary modules live under More. Existing booking forms show real backend availability; no slot calculation was moved to the client. Payroll already uses cards on mobile. Vietnamese and English views share the same screens and components. Theme controls work and the workspace can remain dark throughout navigation.

## Remaining limitations and follow-up

- Native iOS/Android feel, keyboard behavior, safe-area interaction, hardware Back, VoiceOver/TalkBack, haptics and native sharing still need actual development builds and a device pass. Browser emulation cannot establish these.
- Full mutation coverage for all modules is not claimed by this agent: root/domain tests cover customer pagination/validation, resources/team safety, payroll and exports. Mobile checks here primarily cover reading, navigation, form interaction, and calendar failure recovery.
- The documented walk-in budget of at most three taps from launch is not established. The current flow needs New, walk-in mode, service and normally a slot before confirmation. Switching walk-in mode deliberately resets date to today; after opening hours there are no normal slots. This was observed, not counted as a successful booking-save test.
- Date/time entry is inconsistent: appointment creation has a date picker, while holidays/time off use ISO text fields in some forms. A future native date/time pass should unify these and test invalid dates with visible feedback. Domain agent added holiday validation in this task.
- There is no claim of sub-15-second booking completion by representative salon staff. The final usability gate should include short observed sessions with Vietnamese users on their own phones.
- Real Zalo/AI provider behavior is outside this local no-provider run. The unavailable/disconnected states were inspected.
- Initial `?demo=1` in development raised a hydration overlay. The real authenticated routes had no recorded page errors in the route passes; demo behavior was excluded from the core verdict.

## Validation owned by this agent

- `pnpm --filter @gugu/app typecheck`: passed after mobile patches and review follow-up.
- `pnpm --filter @gugu/e2e-web typecheck`: passed for initial new regression; root runs final combined checks.
- Targeted app ESLint: no errors; existing complexity/max-lines warnings remain.
- `/tmp/gugu-mobile-functional.mjs`: four passing combinations after Escape/focus fix.
- Full 12-route scans: no page errors recorded in Chromium vi/light or WebKit en/dark evidence JSON.

Implementation is available in the working branch; milestone completion/merge status is owned by the root agent and is not asserted here.
