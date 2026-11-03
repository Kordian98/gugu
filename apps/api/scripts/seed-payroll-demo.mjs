#!/usr/bin/env node
// Payroll demo (dev only, topic 07 ADR-0014). Usage:
//   node scripts/seed-payroll-demo.mjs [--api http://localhost:3017] [--mailpit http://localhost:18025]
// 1. Runs seed-demo-salon.mjs (owner, salon "Lotus Nail & Spa Quận 1", 4 staff, services, the
//    coming week of bookings) through the API.
// 2. Writes appointment HISTORY for last month and this month so far straight into the dev
//    database (the engine refuses past start times by design): completed, no-show and cancelled
//    bookings, two-staff chains, some amounts recorded at the salon. Never run against production.
// 3. Through the API: pay settings (monthly / per day / hourly / commission only, overrides),
//    service costs, fixed monthly costs, more upcoming bookings incl. a two-staff chain,
//    adjustments, last month closed with "paid" marks; staff (Mai) and manager (Hà) logins.
import { execFileSync } from "node:child_process";
import pg from "pg";

if (process.env.NODE_ENV === "production") throw new Error("seed-payroll-demo is dev-only");
try {
  process.loadEnvFile("../../.env");
} catch {
  /* shell env */
}
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const API_BASE = arg("api", `http://localhost:${process.env.API_PORT ?? "3017"}`);
const API = `${API_BASE}/api/v1`;
const MAIL = `${arg("mailpit", "http://localhost:18025")}/api/v1`;
const TZ = "Asia/Ho_Chi_Minh";
const stamp = Date.now();
const ownerEmail = arg("email", `owner-${stamp}@demo.gugu`);

const db = new URL(process.env.DATABASE_URL ?? "");
if (!/gugu_payroll$/.test(db.pathname)) {
  throw new Error(`refusing to write history outside the payroll preview DB (${db.pathname})`);
}

async function call(auth, path, method = "GET", body, extra = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: auth, ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const idem = () => ({ "idempotency-key": `seed-${Math.random().toString(36).slice(2)}-${Date.now()}` });

async function signIn(email) {
  const r = await fetch(`${API}/auth/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, locale: "vi", client: "native" }),
  });
  if (!r.ok) throw new Error(`magic link ${r.status}`);
  let token;
  for (let i = 0; i < 40 && !token; i++) {
    await new Promise((res) => setTimeout(res, 400));
    const s = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const id = s.messages?.[0]?.ID;
    if (id) token = /verify\?token=([\w-]+)/.exec((await (await fetch(`${MAIL}/message/${id}`)).json()).Text)?.[1];
  }
  if (!token) throw new Error(`magic link for ${email} not found in Mailpit`);
  const res = await fetch(`${API}/auth/magic-link/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, client: "native" }),
  });
  const session = await res.json();
  return `Bearer ${session.session.tokens.accessToken}`;
}

// ── 1. Base demo salon ────────────────────────────────────────────────────────────────────────
const out = execFileSync(
  "node",
  ["scripts/seed-demo-salon.mjs", "--api", API_BASE, "--mailpit", MAIL.replace(/\/api\/v1$/, ""), "--email", ownerEmail],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const { salonId: S } = JSON.parse(out.slice(out.indexOf("{")));
const owner = await signIn(ownerEmail);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = (text, values = []) => client.query(text, values).then((r) => r.rows);
const staffRows = await q(`SELECT id, display_name FROM staff_profiles WHERE salon_id = $1 AND deleted_at IS NULL`, [S]);
const fold = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
const staff = Object.fromEntries(staffRows.map((r) => [fold(r.display_name.split(" ").at(-1)), r.id]));
const svcRows = await q(
  `SELECT s.id, s.name->>'vi' AS name, s.price_amount_minor::int AS price, s.duration_minutes AS minutes,
     (SELECT v.id FROM service_variants v WHERE v.service_id = s.id ORDER BY v.sort_order LIMIT 1) AS variant
   FROM services s WHERE s.salon_id = $1`,
  [S],
);
const svc = Object.fromEntries(svcRows.map((r) => [r.name, r]));
const ownerUser = (await q(`SELECT owner_user_id FROM salons WHERE id = $1`, [S]))[0].owner_user_id;

// ── 2. History: last month + this month until yesterday ──────────────────────────────────────
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const today = ymd(new Date());
const month = today.slice(0, 7);
const lastMonth = (() => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
})();
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`);
const plan = {
  linh: [["Sơn gel", "09:30"], ["Vẽ móng nghệ thuật", "13:30"], ["Sơn gel", "16:00"]],
  mai: [["Đắp bột", "10:00"], ["Sơn gel", "14:00"], ["Vẽ móng nghệ thuật", "17:00"]],
  tuan: [["Cắt tóc nam", "09:00"], ["Nhuộm tóc", "10:00"], ["Cắt tóc nam", "15:00"], ["Cắt tóc nam", "17:30"]],
  ha: [["Chăm sóc da mặt", "10:30"], ["Nối mi", "14:00"], ["Chăm sóc da mặt", "16:30"]],
};
const names = ["Ngọc Anh", "Bảo Vy", "Minh Châu", "Thu Trang", "Quốc Huy", "Hải Yến", "Mỹ Linh", "Thanh Tâm", "Khánh Linh", "Gia Hân"];
let ref = 0;
let n = 0;
async function insertBooking(date, lines, status, recorded) {
  const start = at(date, lines[0].time);
  let cursor = start.getTime();
  const rows = lines.map((l) => {
    const s = svc[l.service];
    const a = new Date(cursor);
    cursor += s.minutes * 60000;
    return { ...l, s, a, b: new Date(cursor) };
  });
  const total = rows.reduce((x, r) => x + r.s.price, 0);
  const who = names[n++ % names.length];
  const phone = `+8490${String(1000000 + (n % 40)).padStart(7, "0")}`;
  const [b] = await q(
    `INSERT INTO bookings (id, salon_id, reference_code, status, source, created_by_actor_type, customer_name,
       customer_phone_e164, staff_id, starts_at, ends_at, total_price_minor, updated_at)
     VALUES (uuidv7(), $1, $2, $3, $4, 'salon_member', $5, $6, $7, $8, $9, $10, now()) RETURNING id`,
    [S, `H${String(++ref).padStart(5, "0")}`, status, ["phone", "zalo_chat", "walk_in", "staff_created"][n % 4], `Khách ${who}`, phone, rows[0].staff, start, new Date(cursor), total],
  );
  for (const [i, r] of rows.entries()) {
    await q(
      `INSERT INTO booking_services (id, salon_id, booking_id, sequence, service_id, variant_id, staff_id, starts_at, ends_at,
         name, duration_minutes, buffer_before_minutes, buffer_after_minutes, price_minor)
       VALUES (uuidv7(), $1, $2, $3, $4, $5, $6, $7, $8, jsonb_build_object('vi', $9::text), $10, 0, 0, $11)`,
      [S, b.id, i + 1, r.s.id, r.s.variant && r.service === "Sơn gel" ? r.s.variant : null, r.staff, r.a, r.b, r.service, r.s.minutes, r.s.price],
    );
  }
  if (status === "completed" && recorded !== null) {
    await q(
      `INSERT INTO offline_sales (id, salon_id, booking_id, amount_minor, method, recorded_by_user_id, updated_at)
       VALUES (uuidv7(), $1, $2, $3, 'cash', $4, now())`,
      [S, b.id, recorded(total), ownerUser],
    );
  }
}
let day = `${lastMonth}-01`;
let i = 0;
while (day < today) {
  if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 0) {
    for (const [who, items] of Object.entries(plan)) {
      for (const [service, time] of items) {
        i++;
        if (i % 6 === 0) continue; // a free slot now and then
        const status = i % 13 === 0 ? "no_show" : i % 17 === 0 ? "cancelled_by_customer" : "completed";
        // Some amounts recorded at the salon; every 5th with a 10 % discount.
        const recorded = i % 3 === 0 ? (t) => (i % 5 === 0 ? Math.round((t * 0.9) / 1000) * 1000 : t) : null;
        await insertBooking(day, [{ service, time, staff: staff[who] }], status, recorded);
      }
    }
    // A two-staff chain every other day: gel by Linh, then nail art by Mai.
    if (i % 2 === 0) {
      await insertBooking(
        day,
        [
          { service: "Sơn gel", time: "11:30", staff: staff.linh },
          { service: "Vẽ móng nghệ thuật", time: "12:15", staff: staff.mai },
        ],
        i % 11 === 0 ? "no_show" : "completed",
        null,
      );
    }
  }
  day = addDays(day, 1);
}
// Execution cost per service (materials) for margins (dev DB; the catalogue PATCH replaces a
// whole service, so the cost is set directly here).
const costs = { "Sơn gel": 25_000, "Đắp bột": 70_000, "Vẽ móng nghệ thuật": 30_000, "Nhuộm tóc": 180_000, "Chăm sóc da mặt": 60_000, "Nối mi": 50_000 };
for (const [name, cost] of Object.entries(costs)) {
  await q(`UPDATE services SET cost_amount_minor = $3 WHERE salon_id = $1 AND name->>'vi' = $2`, [S, name, cost]);
}
// Work schedules were created today by the base seed; let them cover last month too so per-day
// and hourly pay have working days in the history (dev data only).
await q(`UPDATE staff_schedules SET effective_from = $2::date WHERE salon_id = $1`, [S, `${lastMonth}-01`]);
await client.end();

// ── 3. Pay settings, costs, more upcoming bookings, adjustments, close last month ────────────
await call(owner, `/salons/${S}/payroll/staff/${staff.linh}/pay`, "PUT", {
  effectiveFrom: `${lastMonth}-01`, baseType: "monthly", baseAmount: 9_000_000, commissionPercent: 10,
});
await call(owner, `/salons/${S}/payroll/staff/${staff.mai}/pay`, "PUT", {
  effectiveFrom: `${lastMonth}-01`, baseType: "daily", baseAmount: 320_000, commissionPercent: 15,
  overrides: [{ serviceId: svc["Đắp bột"].id, variantId: null, kind: "fixed", amount: 60_000 }],
});
await call(owner, `/salons/${S}/payroll/staff/${staff.tuan}/pay`, "PUT", {
  effectiveFrom: `${lastMonth}-01`, baseType: "hourly", baseAmount: 35_000, commissionPercent: 12,
});
await call(owner, `/salons/${S}/payroll/staff/${staff.ha}/pay`, "PUT", {
  effectiveFrom: `${lastMonth}-01`, baseType: "none", baseAmount: 0, commissionPercent: 35,
});
// A raise for Linh from the 15th of this month (history kept).
await call(owner, `/salons/${S}/payroll/staff/${staff.linh}/pay`, "PUT", {
  effectiveFrom: `${month}-15`, baseType: "monthly", baseAmount: 10_000_000, commissionPercent: 12,
});
for (const [name, category, amount, recurring, m] of [
  ["Tiền thuê mặt bằng", "rent", 18_000_000, true, lastMonth],
  ["Điện nước", "utilities", 2_800_000, true, lastMonth],
  ["Sơn gel, bột, mi (nhập hàng)", "products", 4_500_000, false, month],
  ["Quảng cáo Facebook", "marketing", 1_500_000, true, month],
]) {
  await call(owner, `/salons/${S}/costs`, "POST", { name, category, amount, recurring, month: m });
}
// More upcoming bookings for the rest of the month (the base seed covers 7 days).
const end = (() => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
})();
let up = 0;
for (let d = addDays(today, 7); d <= end; d = addDays(d, 1)) {
  if (new Date(`${d}T12:00:00Z`).getUTCDay() === 0) continue;
  for (const [who, items] of Object.entries(plan)) for (const [service, time] of items) {
    if (++up % 5 === 0) continue;
    await call(owner, `/salons/${S}/bookings`, "POST", {
      serviceId: svc[service].id, variantId: service === "Sơn gel" ? svc[service].variant : null,
      staffId: staff[who], startsAt: at(d, time).toISOString(), source: "phone",
      customer: { name: `Khách ${names[up % names.length]}`, phone: `0912 ${String(100000 + up).slice(0, 3)} ${String(100 + up).slice(-3)}` },
    }, idem()).catch((e) => process.stderr.write(`skip ${d} ${time}: ${String(e.message).slice(0, 80)}\n`));
  }
}
// An upcoming two-staff chain (gel by Linh, then nail art by Mai): first free time that fits.
chain: for (const d of [1, 2, 3, 4, 5, 6]) {
  for (const time of ["18:00", "15:30", "11:00", "09:00"]) {
    const ok = await call(owner, `/salons/${S}/bookings`, "POST", {
      serviceId: svc["Sơn gel"].id, variantId: svc["Sơn gel"].variant, staffId: staff.linh,
      startsAt: at(addDays(today, d), time).toISOString(), source: "zalo_chat",
      customer: { name: "Khách Chuỗi Dịch Vụ", phone: "0988 777 666" },
      nextServices: [{ serviceId: svc["Vẽ móng nghệ thuật"].id, staffId: staff.mai }],
    }, idem()).then(() => true, () => false);
    if (ok) break chain;
  }
}
// Adjustments (reason required), last month closed, two people marked paid.
await call(owner, `/salons/${S}/payroll/adjustments`, "POST", { month: lastMonth, staffId: staff.mai, kind: "bonus", amount: 500_000, reason: "Khách khen nhiều" });
await call(owner, `/salons/${S}/payroll/adjustments`, "POST", { month, staffId: staff.tuan, kind: "advance", amount: 2_000_000, reason: "Ứng lương giữa tháng" });
await call(owner, `/salons/${S}/payroll/adjustments`, "POST", { month, staffId: staff.ha, kind: "deduction", amount: 200_000, reason: "Làm hỏng bộ mi mẫu" });
await call(owner, `/salons/${S}/payroll/months/${lastMonth}/close`, "POST");
const paidOn = `${month}-0${today.slice(8) > "02" ? "2" : "1"}`;
await call(owner, `/salons/${S}/payroll/months/${lastMonth}/staff/${staff.linh}/paid`, "PUT", { paidOn });
await call(owner, `/salons/${S}/payroll/months/${lastMonth}/staff/${staff.mai}/paid`, "PUT", { paidOn });

// ── 4. Logins: Mai (staff) and Hà (manager, no payroll access until the owner grants it) ─────
async function invite(staffId, role, email) {
  const inv = await call(owner, `/salons/${S}/invitations`, "POST", { role, staffProfileId: staffId });
  const token = /token=([\w-]+)/.exec(inv.acceptUrl)?.[1] ?? inv.acceptUrl.split("/").at(-1);
  const bearer = await signIn(email);
  await call(bearer, "/invitations/accept", "POST", { token });
}
const maiEmail = `mai-${stamp}@demo.gugu`;
const haEmail = `ha-${stamp}@demo.gugu`;
await invite(staff.mai, "staff", maiEmail);
await invite(staff.ha, "manager", haEmail);

console.log(
  JSON.stringify(
    {
      salonId: S,
      historyBookings: n,
      logins: { owner: ownerEmail, staffMai: maiEmail, managerHa: haEmail },
      signIn: "Open /vi/sign-in, enter the email, open the link from Mailpit (http://localhost:18025).",
    },
    null,
    2,
  ),
);
