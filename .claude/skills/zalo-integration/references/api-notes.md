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

## Operating without a VN entity (research 2026-11-02)
- [official] OA verification routes: business registration name, a trademark protected in Vietnam (IP Office), or a trading name. A CVXT letter and stamped licences are required. Submit within 14 days of creating the OA; the legal representative confirms within 48 h; review takes 2–3 working days. The ID field accepts "Hộ chiếu", but foreign passports are not addressed.
- [3p] In practice, verification needs a VN business registration or a VN trademark. Foreign citizens reportedly could not verify (2024). Registration needs a +84 phone. Foreign brands commonly use a local partner who owns the OA.
- [official] OA, App and ZBS admins are **personal Zalo users**. App activation asks for phone, email, icon and domain. Integration itself is free. One ZBS Account links many OAs and Apps.
- [3p] Activated apps can only use reviewed/approved APIs. No source found requiring a VN entity to create an App or receive OA permissions.
- [3p] BSPs (Infobip, eSMS, 8x8): messages come from **your own verified OA**. They charge per delivered message and offer SMS failover. No shared-OA offer for foreign senders was found.
- [official] Extensions (OA tiện ích) require a VN-registered developer with IT industry codes 6201/6202/6209/6311. Out of scope for GuGu without an entity.
- [official blog] Mini App owner verification is mandatory: a business verifies via its OA or a business licence plus the representative's ID.
- Unverified: whether a third-party App (GuGu) can be linked to a salon's ZBS Account (spike S-Z2); Zalo Login activation for a foreign-owned app (spike S-Z1).

## Indicative OA packages (3p, unverified)
- 2025: Nâng cao 99k VND/month, Premium 399k/month.
- From 2026-06-01 (per a consultancy): Cơ bản (free for verified OAs), Tiêu chuẩn (~1M/yr), Tăng trưởng (~2.5M/yr), Toàn diện (~6M/yr).

## As implemented (2026-11-02, X24): what the code assumes and must be verified in S-Z1
- Webhook signature: header `X-ZEvent-Signature: mac=<hex>`, hex = SHA-256(appId + rawBody + timestamp + OA secret key) [3p]. Freshness ±5 min on the payload `timestamp` (ms).
- Event shapes:
  - `user_send_*`: `sender.id` = user, `recipient.id` = OA, `message.msg_id`, `message.text`.
  - `follow` / `unfollow`: `oa_id`, `follower.id`.
  - `user_submit_info`: `info.{name, phone}`.
  - `oa_send_*`: the reverse direction (salon replied from OA Manager).
- A tap on a button with type `oa.query.hide` arrives as `user_send_text` whose text is the payload [3p].
- Consultation message with buttons: `{ text, attachment: { type: "template", payload: { buttons: [{ title, type: "oa.query.hide", payload }] } } }` [3p].
- Request-info form: `attachment.payload.template_type = "request_user_info"` with `elements[{title, subtitle}]` [3p].
- User display name: `GET https://openapi.zalo.me/v3.0/oa/user/detail?data={"user_id":…}` → `data.display_name` [3p].
- ZBS template send: `POST https://business.openapi.zalo.me/message/template` with `{ phone: "84…", template_id, template_data, tracking_id }` [3p].
- Error codes mapped in `http-zalo-client.ts` `ERROR_KINDS`. All are [3p] and need checking:
  - −216 / −124: token invalid
  - −230 / −232: outside the window
  - −213: user unreachable
  - −32: rate limit
  - −1124: quota
  - −1131 / −1132: template invalid
