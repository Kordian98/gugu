# Open questions for the product owner

Consolidated from the 13 topic specs. Priority = the roadmap step it blocks (see `00-roadmap.md`). **Rec.** is the recommendation from the topic agent, if it gave one. Record answers in the "Answer" column; the owner agent then updates its spec.

## P0 — blocks Step 0–3 or the business track

| # | Question | Topics | Rec. | Answer |
|---|---|---|---|---|
| 1 | Is there (or will there be) a company registered in Vietnam? Needed for Zalo OA, ZBS Account, SMS brandname, likely store accounts. | 09, 05, 13 | — |No VN entity for now — validate the business concept first; decide later. SMS/OTP and Zalo must work without one (aggregators). (2026-11-02) |
| 2 | Hosting region: Singapore or Vietnam? Depends on legal advice on data localisation (Decree 53) and cross-border transfer (PDPL 91/2025). | 13, 05, 04, 01 | SG, architecture portable to VN |Singapore, likely AWS ap-southeast-1. (2026-11-02) |
| 3 | Is sending salon data to an external LLM (Claude API) acceptable before legal review? | 08 | — | |
| 4 | Who does the legal review, and when? | 05, 13 | before Step 11 at the latest | |
| 5 | Is `gugu.vn` secured? Which entity owns the Apple Developer / Google Play / EAS / Turborepo accounts? | 13, 01 | — | |
| 6 | Art direction: "Saigon soft-pop", "Neon night market" or "Clean glow" (see 02 §11)? | 02 | — |Own direction from reference `design/hero-references/ref-01-homepage-lilac-diorama.png`: lilac/pink pastel, glossy isometric 3D salon diorama, editorial serif + handwritten accents. Mobile-first, alive, gen-z. (2026-11-02) |
| 7 | Hero 3D: references (send to `design/hero-references/`), interactive hotspots or background only, 3D artist budget vs licensed models, show hero in native apps? | 02 | video loop on native |Reference received (ref-01). Isometric salon diorama with zones (Nails, Hair, Skin care, Spa). (2026-11-02) |
| 8 | Are pre-release libraries allowed (e.g. NativeWind v5 rc), or GA only? | 01 | spike decides | |
| 9 | May coding agents merge to `main` after green checks + reviewer agents, or does every PR need human approval? Will other coding agents besides Claude Code be used? | 01 | human approval at first |Yes, agents may merge after green checks + reviewers — local git only for now (no remote). (2026-11-02) |
| 10 | Cloud provider (AWS / GCP, startup credits?) and image storage (Cloudflare R2 vs AWS S3)? | 13, 04 | — |AWS (Singapore) leaning; storage S3 unless 13 argues otherwise. (2026-11-02) |
| 11 | SMS brandname provider (eSMS, VNPT, Viettel, …)? | 05, 11 | — | |
| 12 | Who is the native Vietnamese reviewer for UI copy and templates? | 03 | — | |

## P1 — blocks Steps 4–6 (booking, CRM, marketplace)

| # | Question | Topics | Rec. | Answer |
|---|---|---|---|---|
| 13 | Booking confirmation default: automatic or manual by salon? If manual, response window? | 06 | auto; 12 h if manual | |
| 14 | Customer cancellation cutoff; should late cancels count as a reliability signal for salons? | 06 | 2 h | |
| 15 | Max active bookings per customer per salon? | 06 | 3 | |
| 16 | Book on behalf of someone else in MVP? | 06 | — | |
| 17 | Multi-service appointments at launch (phase B), or one service + variant only? | 06 | single service at launch | |
| 18 | Can reception add bookings outside the schedule (walk-ins), with audit? Can a salon hide staff choice? | 06, 07 | yes, audited | |
| 19 | Chains with multiple locations at launch, with combined reporting? | 04, 07 | — | |
| 20 | Can salons add clients without a GuGu account? Fully anonymous walk-ins? | 04, 07 | — | |
| 21 | Prepaid packages ("combo 10 buổi") in MVP? Staff commission tracking? | 07 | — | |
| 22 | Is entering the amount received at completion required or optional? | 07 | optional | |
| 23 | Shared reception tablets with PIN lock at launch? Can staff see their own ratings? | 07 | — | |
| 24 | Can staff see customer phone numbers by default? | 05 | no | |
| 25 | Launch cities: HCMC + Hanoi only, or nationwide? | 10 | — | |
| 26 | Maps / geocoding provider: Google, VietMap/Goong, OSM? | 10 | — | |
| 27 | Price format: `150.000đ` or `150.000 ₫`? SMS without diacritics? CRM tone "bạn" or "anh/chị"? | 03 | SMS `vi-ascii` | |
| 28 | Zalo Login for customers in MVP? Central GuGu OA from day one? | 05, 09 | — | |
| 29 | Manual image moderation at launch or automated classifier? | 04 | — | |
| 30 | Should old district names appear in page titles ("Nail Quận 1")? Editorial content in admin or in repo? | 10 | — | |

## P2 — blocks Steps 7–10 (trust, AI agent, Zalo, monetization)

| # | Question | Topics | Rec. | Answer |
|---|---|---|---|---|
| 31 | Plans and prices; which plans include the AI agent; trial quota for free salons? | 12, 08 | — | |
| 32 | Target monthly AI cost per salon; route simple questions to a cheaper model? | 08 | — | |
| 33 | Who pays for Zalo template / SMS messages: GuGu in plan, or the salon? | 09, 11, 12 | — | |
| 34 | Commissions in year 1 at all? Attribution window 30 days OK? | 12 | foundation only, inactive | |
| 35 | Who issues VAT e-invoices for subscriptions? | 12 | — | |
| 36 | Analytics: PostHog self-hosted or cloud? | 12 | — | |
| 37 | Should salons see their reliability score? | 12 | — | |
| 38 | Review windows (30 days to write, 14 to edit) OK? May review text go to an external AI for moderation? | 11 | — | |
| 39 | Account deletion grace period; do salon notes about a customer survive the customer's deletion? Retention after salon closure; AI conversation retention? | 11, 05, 04, 08 | 30 days grace | |
| 40 | Zalo reminders by default or only after customer consent? AI auto-replies on Zalo only in paid plans? | 09 | — | |
| 41 | Zalo Mini App needed at launch? How many target salons already have their own OA (field research)? | 09 | post-MVP | |
| 42 | AI price-list import free and only the chat paid? Priority write actions for the agent (phase B)? Assistant name and tone? | 07, 08 | — | |
| 43 | Allow AI crawlers on public pages? Star ratings in Google from launch? Promoted listings in search at launch? | 10, 12 | allow crawlers | |
| 44 | Dark mode in the marketplace at launch or CRM only? Paid heading font allowed if it supports Vietnamese well? | 02 | — | |
| 45 | On-call after launch; device farm vs own devices; monthly budget cap for CI evals and Claude PR review? | 13 | — | |
