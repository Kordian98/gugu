# Salon custom domains — parked design (BLOCKED, X23)

Status: **blocked pending Vietnamese legal review / VN company.** Do not implement. A customer-facing booking surface, even on the salon's own domain, may make GuGu an intermediary platform under Law 122/2025. No legal conclusion is claimed here. Full context: `docs/tasks/10-marketplace-seo.md` Appendix B.

## Design notes (from rev 3)
1. Owner enters a domain (prefer a subdomain such as `book.salon.vn`; apex needs ALIAS/A records).
2. GuGu creates a pending `CustomDomain` row with a random token. The owner adds TXT `_gugu-verify.<domain>` = token and CNAME `<domain>` → `custom.gugu.vn`.
3. A BullMQ job polls DNS with backoff. Once verified, it requests TLS through a `CustomDomainProvider` port:
   - Cloudflare for SaaS (custom hostnames)
   - CloudFront SaaS Manager (distribution tenants, per-tenant ACM certificates issued in us-east-1, priced per tenant beyond 200)
   - Caddy on-demand TLS with an "ask" endpoint that only approves verified domains
4. Routing: `Host` header → salon (cached domain map). One salon per domain.
5. Canonical: the verified primary domain is canonical, and the gugu.vn URL 301-redirects to it. If DNS is removed, revert after a grace period.
6. Daily re-verification guards against dangling-domain takeover. Cookies are host-scoped.
7. Bot check: Turnstile allows 10 hostnames per widget (more needs Enterprise or the "any hostname" entitlement). Validate `hostname` in Siteverify, or use another check.
