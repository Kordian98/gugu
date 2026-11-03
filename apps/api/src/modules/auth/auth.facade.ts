// Public surface of the auth module (boundary rule api-modules-use-facades).
export { AuthModule } from "./auth.module";
export { AccountsService } from "./application/accounts.service";
export { MagicLinkService, type IssueMagicLink } from "./application/magic-link.service";
export { SessionService, type AuthenticatedSession } from "./application/session.service";
export {
  CSRF_HEADER,
  parseCookies,
  requestMeta,
  sessionCookieName,
  setSessionCookie,
  type RequestMeta,
} from "./infra/http-meta";
export { safeEqual } from "./infra/tokens";
export { AdminMfaService, MFA_FAILURE_RULE } from "./mfa/admin-mfa.service";
export { generateTotpSecret, totp } from "./mfa/totp";
