# Design and localization review — 2026-11-05

**Verdict: Approve** for the CRM SaaS audit changes relative to checkpoint `e935949`. No remaining introduced blocker was found in the reviewed changes. This is a working-tree review, not a protected merge-gate verdict or a claim that native-device acceptance is complete.

Reviewed the updated customer directory and profile, pagination/search hooks, Today, cached-read recovery, mobile calendar and agenda, service cards, shared form controls, destructive confirmations, and vi/en copy against the repository's design-reviewer and localization instructions.

## Findings resolved during review

- Failed background refreshes no longer replace already-cached appointments or settings with an error-only screen. Initial failures still have an explicit retry state. Staff My Day also receives the refresh warning.
- Resource-type deletion failures now appear inside the active confirmation instead of behind it.
- Inline Select returns keyboard focus to its trigger after selection. It consumes both Escape keydown and keyup before React Native Web's document-level Modal handler, closing choices while retaining the editor.
- Customer history/upcoming visit rows stack on mobile, giving the service name full width instead of squeezing it between a fixed date column and status badge.
- Mobile service and agenda names are readable at the narrow viewport; key controls use the shared minimum touch target. Shared inputs use the body type token, and statuses retain text labels.

## Evidence and limits

- Personally ran `pnpm --filter @gugu/localization test`: **15/15 passed**, including key/placeholder parity. New CRM copy uses vi/en dictionaries and the Vietnamese CRM register.
- Personally checked the final relevant source and `git diff --check`: no whitespace errors or remaining introduced blocking logic issue found.
- Root reports the production-export combined regression suite **12/12 passed**, covering CRM, mobile, resource/team/settings/schedules, flexible booking and payroll in Chromium/WebKit. The Select Escape interaction was verified in vi/en; mobile service/agenda/form regressions are included in `mobile-usability.spec.ts`.
- Native hardware, software-keyboard behavior, OS share destinations, and final Vietnamese editorial approval remain separately recorded acceptance limits; browser emulation and unit tests do not establish those results.

This review does not expand the change into deferred product features or a full accessibility certification.
