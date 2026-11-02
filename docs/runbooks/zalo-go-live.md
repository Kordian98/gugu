# Runbook: switch Zalo from the emulator to real Zalo

Use this when GuGu has a registered Zalo developer App (q81) and a first pilot salon with a verified OA (q82). No code change should be needed. If one is, treat it as a bug in the integration-ready layer and fix it there.

## 1. One-time setup (GuGu)
1. On developers.zalo.me, create the App under the Polish company. The admin is a founder's personal Zalo account (+84 number); add a second admin.
2. App → Official Account → General settings:
   - Callback URL: `https://<api-host>/api/v1/integrations/zalo/oauth/callback`
   - Request the OA permissions: messages (consultation), user info, ZBS template messages.
3. Verify the API domain (Zalo domain verification). Set the webhook URL to `https://<api-host>/api/v1/integrations/zalo/webhook` and subscribe to `follow`, `unfollow`, `user_send_*`, `user_submit_info`, `oa_send_*`.
4. Copy the App id, the App secret and the **OA Secret Key** (webhook signing key).
5. In the secrets manager, set:
   - `ZALO_CLIENT=http`
   - `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_SECRET_KEY`
   - `ZALO_TOKEN_KEY`: 32+ random characters. Never rotate it without re-encrypting the tokens.
   - `API_PUBLIC_URL=https://<api-host>`

   Boot fails if any of them is missing.
6. Make sure the worker egress can reach `openapi.zalo.me`, `oauth.zaloapp.com` and `business.openapi.zalo.me`. Some user-info calls are reported to need a Vietnamese IP. Check this in step 3.

## 2. Spike S-Z1 (staging, one friendly salon)
- [ ] Connect the salon's OA from Settings → Zalo. The connection status is `connected` and the OA name is right.
- [ ] Send "xin chào" from a personal Zalo to the OA. A webhook arrives (`zalo_webhook_events.status = processed`) and the bot greets with buttons.
- [ ] Tap a button. Confirm it arrives as `user_send_text` with the `gg|…` payload. If not, adapt `toInbound()`.
- [ ] Share a phone with the request-info form. Confirm the `user_submit_info` payload shape (`info.phone`).
- [ ] Book end to end, then cancel from "Lịch hẹn của tôi".
- [ ] Compare the send-log error codes for an out-of-window send (expect -230) and an expired token (expect -216). Update `ERROR_KINDS` if needed.
- [ ] Confirm the signature formula against a real event (a mismatch means 401 on every event).
- [ ] Record the findings in an ADR and in `.claude/skills/zalo-integration/references/api-notes.md`.

## 3. Per salon (pilot onboarding)
1. The salon owns a **verified** OA (business licence) linked to its own ZBS Account. Template sends cost money (q83).
2. Owner: Settings → Zalo → Connect → approve in Zalo.
3. Optional: register ZBS templates "booking confirmation" and "booking reminder" with the parameters `customer_name`, `booking_code`, `service_name`, `booking_time`, `salon_name`. Once Zalo approves them, enter their ids in Settings → Zalo.
4. Optional: set a monthly template cap.

## 4. Rollback
Set `ZALO_CLIENT=disabled` and redeploy. Webhooks then return 503, the panel shows "not enabled", and nothing is sent. Connections and history are kept. Setting it back to `http` resumes; tokens may need a reconnect if they expired meanwhile.
