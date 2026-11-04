#!/usr/bin/env node
/**
 * Landing screenshots only (dev, your own DB): makes the payroll demo salon's current month realistically
 * busy, so "Tháng này" shows a realistic positive estimate (owner, 2026-11-04). The payroll seed books
 * about 3 appointments per person per day; a busy 4-person nail/hair/spa salon in District 1 does about
 * 5–6. This adds ~2 extra bookings per person per working day for the rest of the month through the
 * normal booking API (slots already taken are skipped by the engine). No DB writes, no history changes.
 *
 *   node scripts/landing-demo-busier.mjs --api http://localhost:3041 --email lan.owner@lotus-demo.gugu
 */
if (process.env.NODE_ENV === "production") throw new Error("landing-demo-busier is dev-only");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const API = `${arg("api", "http://localhost:3041")}/api/v1`;
const MAIL = `${arg("mailpit", "http://localhost:18025")}/api/v1`;
const email = arg("email", "");
if (!email) throw new Error("--email <owner> is required");
const TZ_OFFSET = "+07:00";

let cookieHdr = {};
async function call(auth, path, method = "GET", body, extra = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
      ...cookieHdr,
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const idem = () => ({
  "idempotency-key": `busier-${Math.random().toString(36).slice(2)}-${Date.now()}`,
});

async function signIn() {
  const since = Date.now();
  const r = await fetch(`${API}/auth/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, locale: "vi", client: "native" }),
  });
  if (!r.ok) throw new Error(`magic link ${r.status}`);
  let token;
  for (let i = 0; i < 50 && !token; i++) {
    await new Promise((res) => setTimeout(res, 400));
    const s = await (
      await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    ).json();
    const m = s.messages?.find((x) => Date.parse(x.Created) >= since - 5000);
    if (m)
      token = /verify\?token=([\w-]+)/.exec(
        (await (await fetch(`${MAIL}/message/${m.ID}`)).json()).Text,
      )?.[1];
  }
  if (!token) throw new Error("magic link not found in Mailpit");
  const res = await fetch(`${API}/auth/magic-link/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, client: "native" }),
  });
  return `Bearer ${(await res.json()).session.tokens.accessToken}`;
}

// Reuse the capture script's cached web session (magic links are rate-limited) when available.
const cached = arg("cookie", "");
const auth = cached ? "" : await signIn();
cookieHdr = cached
  ? { cookie: `gugu_session=${cached}`, origin: arg("origin", "http://localhost:8098") }
  : {};
const me = await call(auth, "/me");
// Cookie (web) sessions need the CSRF token from /me on writes.
if (me.csrfToken) cookieHdr = { ...cookieHdr, "x-csrf-token": me.csrfToken };
const S = arg("salon", "") || JSON.stringify(me).match(/"salonId":"([0-9a-f-]{36})"/)?.[1];
if (!S) console.error(JSON.stringify(me).slice(0, 400));
if (!S) throw new Error("no salon for this owner");
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
const staffList = await call(auth, `/salons/${S}/team`);
if (process.env.DEBUG) console.error(JSON.stringify(staffList).slice(0, 600));
const svcList = await call(auth, `/salons/${S}/services`);
const arr = (x) => (Array.isArray(x) ? x : (x.items ?? x.data ?? []));
const staff = Object.fromEntries(
  arr(staffList).map((p) => [
    fold(p.displayName ?? p.name ?? "")
      .split(" ")
      .pop(),
    p.id,
  ]),
);
const svc = Object.fromEntries(
  arr(svcList).map((s) => [fold(typeof s.name === "string" ? s.name : (s.name?.vi ?? "")), s]),
);
const pick = (n) => svc[fold(n)];
/** Extra bookings per person per working day (on top of the seed's plan). */
const EXTRA = {
  mai: [
    ["Sơn gel", "11:45"],
    ["Đắp bột", "15:45"],
    ["Sơn gel", "19:00"],
  ],
  linh: [
    ["Sơn gel", "11:30"],
    ["Vẽ móng nghệ thuật", "15:30"],
    ["Sơn gel", "19:00"],
  ],
  tuan: [
    ["Cắt tóc nam", "12:00"],
    ["Nhuộm tóc", "13:00"],
    ["Cắt tóc nam", "16:30"],
  ],
  ha: [
    ["Nối mi", "09:00"],
    ["Chăm sóc da mặt", "12:00"],
    ["Nối mi", "18:00"],
  ],
};
// --round 2 fills further free slots at other times.
if (arg("round", "1") === "2") {
  EXTRA.mai = [
    ["Sơn gel", "09:00"],
    ["Vẽ móng nghệ thuật", "13:15"],
    ["Sơn gel", "17:30"],
  ];
  EXTRA.linh = [
    ["Sơn gel", "09:00"],
    ["Sơn gel", "13:15"],
    ["Vẽ móng nghệ thuật", "17:30"],
  ];
  EXTRA.tuan = [
    ["Cắt tóc nam", "11:00"],
    ["Cắt tóc nam", "18:30"],
    ["Cắt tóc nam", "19:15"],
  ];
  EXTRA.ha = [
    ["Chăm sóc da mặt", "13:00"],
    ["Nối mi", "15:30"],
    ["Chăm sóc da mặt", "19:00"],
  ];
}
const NAMES = [
  "Ngọc Anh",
  "Bảo Vy",
  "Minh Châu",
  "Thu Trang",
  "Quốc Huy",
  "Hải Yến",
  "Mỹ Linh",
  "Thanh Tâm",
  "Khánh Linh",
  "Gia Hân",
  "Phương Thảo",
  "Diệu Linh",
  "Tuấn Anh",
  "Hồng Nhung",
  "Kim Ngân",
];
const today = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);
const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
let ok = 0;
let skip = 0;
let n = 0;
for (let d = new Date(today.getTime() + 86400000); d <= end; d = new Date(d.getTime() + 86400000)) {
  if (d.getUTCDay() === 0) continue;
  for (const [who, items] of Object.entries(EXTRA)) {
    const staffId = staff[who];
    if (!staffId) continue;
    for (const [service, time] of items) {
      const s = pick(service);
      if (!s) continue;
      n++;
      try {
        await call(
          auth,
          `/salons/${S}/bookings`,
          "POST",
          {
            serviceId: s.id,
            variantId: s.variants?.[0]?.id ?? null,
            staffId,
            startsAt: new Date(`${ymd(d)}T${time}:00${TZ_OFFSET}`).toISOString(),
            source: n % 3 === 0 ? "walk_in" : "zalo_chat",
            customer: {
              name: NAMES[n % NAMES.length] ?? "Ngọc Anh",
              phone: `0913 ${String(200000 + n).slice(0, 3)} ${String(100 + (n % 900)).padStart(3, "0")}`,
            },
          },
          idem(),
        );
        ok++;
      } catch (e) {
        if (skip < 2) console.error(String(e.message).slice(0, 300));
        skip++;
      }
    }
  }
}
console.log(JSON.stringify({ salonId: S, added: ok, skipped: skip }));
