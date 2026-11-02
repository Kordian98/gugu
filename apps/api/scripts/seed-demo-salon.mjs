#!/usr/bin/env node
// Demo salon for screenshots and demos (dev only). Usage:
//   node scripts/seed-demo-salon.mjs [--api http://localhost:3002] [--mailpit http://localhost:18025] [--email demo@...]
// Creates through the public API (no DB writes): owner account (magic link via Mailpit), salon
// "Lotus Nail & Spa Quận 1", opening hours, 7 services, 4 staff with schedules, ~1 week of bookings
// for the coming week. Prints the owner email: sign in on the web
// app with it (the magic link arrives in Mailpit). Refuses to run when NODE_ENV=production.
if (process.env.NODE_ENV === "production") throw new Error("seed-demo-salon is dev-only");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const API = `${arg("api", "http://localhost:3002")}/api/v1`;
const MAIL = `${arg("mailpit", "http://localhost:18025")}/api/v1`;
const email = arg("email", `demo-${Date.now()}@demo.gugu`);
const TZ = "Asia/Ho_Chi_Minh";
let auth = "";

async function call(path, method = "GET", body, extra = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const idem = () => ({ "idempotency-key": `seed-${Math.random().toString(36).slice(2)}-${Date.now()}` });
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// 1. Owner account (native client → bearer token).
await call("/auth/magic-link", "POST", { email, locale: "vi", client: "native" });
let token;
for (let i = 0; i < 30 && !token; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const s = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
  const id = s.messages?.[0]?.ID;
  if (id) token = /verify\?token=([\w-]+)/.exec((await (await fetch(`${MAIL}/message/${id}`)).json()).Text)?.[1];
}
if (!token) throw new Error("magic link not found in Mailpit");
const session = await call("/auth/magic-link/verify", "POST", { token, client: "native" });
auth = `Bearer ${session.session.tokens.accessToken}`;

// 2. Salon.
const cats = (await call("/public/categories")).items;
const prov = (await call("/public/locations?level=province")).items[0];
const ward = (await call(`/public/locations?level=ward&parentId=${prov.id}`)).items[0];
const cat = (slug) => cats.find((c) => c.slug === slug)?.id ?? null;
const { salonId: S } = await call("/salons/registrations", "POST", {
  businessName: "Lotus Nail & Spa Quận 1", categoryId: cat("nails") ?? cats[0].id, phone: "0912 345 678",
  provinceId: prov.id, wardId: ward.id, streetAddress: "12 Lê Lợi", locationsHint: "1", locale: "vi",
});
await call(`/salons/${S}/settings/opening-hours`, "PATCH", {
  days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, intervals: [{ start: "09:00", end: weekday === 7 ? "18:00" : "21:00" }] })),
});

// 3. Team.
const staff = {};
for (const [key, displayName, color] of [["linh", "Nguyễn Linh", "lilac"], ["mai", "Trần Mai", "pink"], ["tuan", "Lê Tuấn", "peach"], ["ha", "Phạm Hà", "gold"]]) {
  staff[key] = (await call(`/salons/${S}/team`, "POST", { displayName, color, linkToMe: key === "linh" })).id;
  await call(`/salons/${S}/team/${staff[key]}/schedule`, "PATCH", {
    days: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, intervals: [{ start: "09:00", end: "20:00" }], breaks: [{ start: "12:00", end: "13:00" }] })),
  });
}

// 4. Services.
const svc = async (body) => call(`/salons/${S}/services`, "POST", body);
const gel = await svc({ name: { vi: "Sơn gel", en: "Gel polish" }, categoryId: cat("nails"), price: 150000, priceMax: 250000, durationMinutes: 45, bufferAfterMinutes: 10,
  variants: [{ name: { vi: "Tay", en: "Hands" }, price: 150000, durationMinutes: 45 }, { name: { vi: "Chân", en: "Feet" }, price: 180000, durationMinutes: 60 }],
  addOns: [{ name: { vi: "Phá gel cũ", en: "Gel removal" }, extraPrice: 50000, extraDurationMinutes: 15 }], staffIds: [staff.linh, staff.mai] });
const acr = await svc({ name: { vi: "Đắp bột", en: "Acrylic set" }, categoryId: cat("nails"), price: 350000, durationMinutes: 90, staffIds: [staff.mai] });
const art = await svc({ name: { vi: "Vẽ móng nghệ thuật", en: "Nail art" }, categoryId: cat("nails"), price: 200000, priceMax: 400000, durationMinutes: 60, staffIds: [staff.linh, staff.mai] });
const cut = await svc({ name: { vi: "Cắt tóc nam", en: "Men's haircut" }, categoryId: cat("hair"), price: 120000, durationMinutes: 30, staffIds: [staff.tuan] });
const color = await svc({ name: { vi: "Nhuộm tóc", en: "Hair colour" }, categoryId: cat("hair"), price: 650000, priceMax: 1200000, durationMinutes: 120, staffIds: [staff.tuan] });
const facial = await svc({ name: { vi: "Chăm sóc da mặt", en: "Facial" }, categoryId: cat("skin") ?? cat("spa"), price: 450000, durationMinutes: 60, staffIds: [staff.ha] });
const lash = await svc({ name: { vi: "Nối mi", en: "Lash extensions" }, categoryId: cat("lashes"), price: 300000, durationMinutes: 75, staffIds: [staff.ha] });

// 5. Bookings for the coming week. The engine refuses start times in the past (by design), so
//    history builds up as days pass; bookings already started today are completed or marked no-show.
const clients = [["Nguyễn Thị Ngọc Anh", "0912 000 111"], ["Trần Bảo Vy", "0987 000 222"], ["Lê Minh Châu", "0909 000 333"], ["Phạm Thu Trang", "0911 000 444"],
  ["Võ Quốc Huy", "0933 000 555"], ["Đỗ Hải Yến", "0944 000 666"], ["Hoàng Mỹ Linh", "0966 000 777"], ["Bùi Thanh Tâm", "0977 000 888"]];
const plan = [[gel, "linh", "09:30", gel.variants[0].id], [acr, "mai", "10:00"], [cut, "tuan", "09:00"], [facial, "ha", "10:30"],
  [art, "linh", "14:00"], [color, "tuan", "14:00"], [lash, "ha", "15:00"], [gel, "mai", "16:00", gel.variants[1].id], [cut, "tuan", "17:30"]];
const today = ymd(new Date());
let n = 0;
for (let d = 0; d <= 6; d++) {
  const date = addDays(today, d);
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) continue;
  for (const [i, [service, who, time, variantId]] of plan.entries()) {
    if ((i + d) % 4 === 0) continue;
    const [name, phone] = clients[(i + d + 8) % clients.length];
    const past = d < 0 || (d === 0 && time < new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()));
    try {
      const b = await call(`/salons/${S}/bookings`, "POST", {
        serviceId: service.id, variantId: variantId ?? null, staffId: staff[who], startsAt: at(date, time),
        source: ["phone", "zalo_chat", "staff_created", "walk_in"][(i + d + 8) % 4],
        customer: (i + d + 8) % 4 === 3 ? null : { name, phone },
        ...(past ? { overrides: ["lead_time"], overrideReason: "Demo seed (earlier today)" } : {}),
      }, idem());
      n++;
      if (past) {
        const to = (i + d + 8) % 7 === 0 ? "no_show" : "completed";
        await call(`/salons/${S}/bookings/${b.id}/transitions`, "POST", { to }, idem()).catch(() => undefined);
      }
    } catch (e) {
      process.stderr.write(`skip ${date} ${time}: ${String(e.message).slice(0, 120)}\n`);
    }
  }
}
console.log(JSON.stringify({ email, salonId: S, bookings: n, signIn: "Open /vi/sign-in, enter the email, open the link from Mailpit." }, null, 2));
