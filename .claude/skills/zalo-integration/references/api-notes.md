# Zalo API notes (checked 2026-11-02 — re-verify before relying on details)

Items marked (3p) come from third-party SDKs or docs and have not been confirmed against official Zalo docs.

## Accounts and entities
- **Zalo App** (developers.zalo.me): GuGu's technical identity. It holds the app id and secret, the OAuth config and the webhook URL. One app can act for **many OAs**.
- **Official Account (OA)**: the business's Zalo presence. Salons may have their own; GuGu will have a central OA.
- **ZBS Account** (renamed from Zalo Cloud Account / ZCA on 2026-01-01): the billing wallet for paid services. The OA and the App must both be linked to it, and the person linking them needs Admin on each.
- Zalo business services require a **Vietnam-based company**.

## OAuth v4 (OA permission) (3p endpoints)
- Authorize: `https://oauth.zaloapp.com/v4/oa/permission?app_id=…&redirect_uri=…&code_challenge=…&state=…`
- Token and refresh: `POST https://oauth.zaloapp.com/v4/oa/access_token` (header `secret_key`; `grant_type=authorization_code|refresh_token`).
- PKCE: the verifier is 43–128 chars and the challenge is base64url(SHA256(verifier)), S256.
- Token lifetimes: read `expires_in` from the response and never assume it. Refresh tokens rotate, so always persist the new one.

## Social login v4 (customer) (3p)
- Same PKCE pattern with the `/v4/permission` endpoint. User info comes from `graph.zalo.me/v2.0/me` (id, name, picture).
- A phone number is **not** returned by default. Treat it as unavailable until a special permission is granted.

## OA OpenAPI v3 (messages)
- Message classes: `cs` (consultation), `transaction`, `promotion`. Formats: text, image, file (upload first), list/buttons.
- Consultation via the OpenAPI: allowed **≤7 days** after the user's last interaction; free **≤48 h**. OA Manager allows 365 days.
- What counts as an interaction: messaging the OA, calling it or accepting its call, commenting on an OA post, using the chatbot/menu/CTA/widget, or posting in the GMF group. Following the OA or tapping "Nhắn tin" allows an immediate greeting.
- The user must not have blocked the OA.
- Broadcast: OA Manager web only, 06:00–19:59, quota set by the OA package.
- Some APIs require a paid OA tier. Some user-info calls require a **Vietnamese IP** (3p).

## Webhooks (3p)
- HTTPS on a **verified domain**; respond **200 within 5 s**.
- Signature: HMAC-SHA256 with the app secret. Compare in a timing-safe way.
- Events: `follow`, `unfollow`, `user_send_text|image|file|location|sticker|gif`, `user_click_button`, `user_click_link`, and seen/received variants.
- Payloads contain `oa_id` (recipient), the sender UID and a timestamp. Use them for tenant resolution and idempotency.

## ZBS Template Message (formerly ZNS)
- Since **2026-01-01** it unifies ZNS, UID Transaction and UID Broadcast. The old UID template formats were unsupported from **2026-03-01**.
- Types: **Transaction** (Giao dịch) and **After-sales** (Hậu mãi). OTP templates exist under the ZNS lineage; verify the current tag.
- Delivery: by **phone number** (OpenAPI), by **UID** (OpenAPI), or both via OA Manager campaigns.
- Templates must be **pre-approved** (about 1–3 business days (3p)). Max **400 chars**. One message per transaction. Promotional sends are limited to 1 per OA per user per day.
- Pricing (3p, indicative only): roughly 200 VND per transactional message and 300 VND per promotional one, via resellers. UID-based sends are cheaper. Keep all prices in config.
- There is a later mechanism update (changelog V261001) whose content was not reviewed. **Read it before Z1.**

## Zalo Mini App
- A React web app inside Zalo. Tooling: `zmp-cli`, `zmp-sdk`, `zmp-ui`. Docs: miniapp.zaloplatforms.com.
- User APIs: `getUserInfo`, `authorize`, `getPhoneNumber`. The phone API needs a permission request in app management.
- Official starter with a booking flow: `Zalo-MiniApp/zaui-restaurant`.

## Indicative OA packages (3p, unverified)
- 2025: Nâng cao 99k VND/month, Premium 399k/month.
- From 2026-06-01 (per a consultancy): Cơ bản (free for verified OAs), Tiêu chuẩn (~1M/yr), Tăng trưởng (~2.5M/yr), Toàn diện (~6M/yr).
