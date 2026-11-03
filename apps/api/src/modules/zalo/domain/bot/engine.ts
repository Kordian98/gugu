import { formatVND } from "@gugu/localization";
import { normalizeVnPhone } from "@gugu/domain";
import { type FunnelEventInput, type FunnelStep, type SessionEndReason, stepRank } from "../funnel";
import { DAY_PARTS, type DayPart, dayPartOf, type ParsedWhen, parseWhen } from "./when";
import {
  globalPayload,
  type GlobalCommand,
  keywordCommand,
  normalizeText,
  optionPayload,
  parsePayload,
} from "./payload";
import {
  type BotBooking,
  type BotButton,
  type BotEffect,
  type BotInput,
  type BotPorts,
  type BotReply,
  type BotResult,
  type BotService,
  type BotSession,
  type BotState,
  type BotStep,
  type BotT,
  FLOW_TIMEOUT_MS,
  BOOKING_DAYS,
  BOT_MAX_SERVICES,
  INITIAL_BOT_STATE,
  isSetupIssue,
  MAX_BUTTONS,
  PAGE_SIZE,
  type Selection,
} from "./types";

export interface BotDeps {
  now: Date;
  /** New random id (funnel session ids). */
  newId: () => string;
  t: BotT;
  locale: "vi" | "en";
}

/** One prepared reply: text, the buttons and the option value behind each button. */
interface Menu {
  text: string;
  /**
   * Option values by index. Hidden options get no button (Zalo shows at most MAX_BUTTONS) but can
   * still be picked by typing their number — the text lists them all.
   */
  options: { title: string; value: string; hidden?: boolean }[];
  /** Leading options that are numbered list items. */
  items: number;
}

/**
 * Runs one customer input through the booking flow and returns the next state, the replies to send
 * (in order) and side effects for the caller (hand-off, contact details, staff notifications).
 * Deterministic for given ports and deps — all I/O goes through `ports`.
 */
export async function runBot(
  current: BotState | null,
  input: BotInput,
  ports: BotPorts,
  deps: BotDeps,
): Promise<BotResult> {
  const timedOut = isTimedOut(current, deps.now);
  const run = new BotRun(normalizeState(current, timedOut), ports, deps);
  return run.handle(input, timedOut);
}

function isTimedOut(state: BotState | null, now: Date): boolean {
  if (state?.v !== 1) return false;
  const at = state.at ? Date.parse(state.at) : 0;
  return (
    (state.step.name !== "idle" || Boolean(state.session)) && now.getTime() - at > FLOW_TIMEOUT_MS
  );
}

function normalizeState(state: BotState | null, timedOut: boolean): BotState {
  if (state?.v !== 1) return { ...INITIAL_BOT_STATE };
  if (timedOut) return { ...state, step: { name: "idle" }, options: [], items: 0 };
  return state;
}

/**
 * Closes a booking attempt that went quiet for longer than the flow timeout (the periodic sweep:
 * customers who never write again). Returns null when nothing is due.
 */
export function expireSession(
  state: BotState | null,
  now: Date,
): { state: BotState; effects: BotEffect[] } | null {
  if (!state?.session || !isTimedOut(state, now)) return null;
  const s = state.session;
  return {
    state: { ...state, step: { name: "idle" }, options: [], items: 0, session: null },
    effects: [
      {
        type: "funnel",
        event: {
          event: "session_ended",
          sessionId: s.id,
          step: s.step,
          reason: s.issue ?? "abandoned",
        },
      },
    ],
  };
}

class BotRun {
  private readonly replies: BotReply[] = [];
  private readonly effects: BotEffect[] = [];
  private step: BotStep;
  private seq: number;
  private menu: Menu | null = null;
  private phone: string | null;
  private name: string | null;
  private session: BotSession | null;

  constructor(
    private readonly state: BotState,
    private readonly ports: BotPorts,
    private readonly deps: BotDeps,
  ) {
    this.step = state.step;
    this.seq = state.seq;
    this.phone = ports.customer.phone;
    this.name = ports.customer.name;
    this.session = state.session ?? null;
  }

  // --- funnel tracking ---------------------------------------------------------------------

  private track(event: FunnelEventInput): void {
    this.effects.push({ type: "funnel", event });
  }

  private startSession(): void {
    this.endSession();
    this.session = { id: this.deps.newId(), step: "service", issue: null };
    this.track({ event: "session_started", sessionId: this.session.id, step: "service" });
    this.track({ event: "step_reached", sessionId: this.session.id, step: "service" });
  }

  private reach(step: FunnelStep): void {
    const s = this.session;
    if (!s || stepRank(step) <= stepRank(s.step)) return;
    s.step = step;
    this.track({ event: "step_reached", sessionId: s.id, step });
  }

  /** Ends the open attempt; without a reason it was left (abandoned or after its last problem). */
  private endSession(reason?: SessionEndReason): void {
    const s = this.session;
    if (!s) return;
    this.track({
      event: "session_ended",
      sessionId: s.id,
      step: s.step,
      reason: reason ?? s.issue ?? "abandoned",
    });
    this.session = null;
  }

  private issue(kind: "not_understood" | "slot_taken"): void {
    this.track({ event: kind, sessionId: this.session?.id ?? null });
    if (this.session) this.session.issue = kind;
  }

  private t(key: string, vars?: Record<string, string | number>): string {
    return this.deps.t(`bot.${key}`, vars);
  }

  async handle(input: BotInput, timedOut = false): Promise<BotResult> {
    if (timedOut) this.endSession();
    await this.dispatch(input);
    return this.finish();
  }

  private finish(): BotResult {
    let options: string[] = [];
    let items = 0;
    if (this.menu) {
      this.seq += 1;
      const seq = this.seq;
      const buttons: BotButton[] = this.menu.options.flatMap((o, i) =>
        o.hidden
          ? []
          : [
              {
                title: o.title,
                payload: o.value.startsWith("gg|") ? o.value : optionPayload(seq, i),
              },
            ],
      );
      options = this.menu.options.map((o) => o.value);
      items = this.menu.items;
      this.replies.push({ kind: "text", text: this.menu.text, buttons });
    }
    return {
      state: {
        v: 1,
        seq: this.seq,
        step: this.step,
        options,
        items,
        at: this.deps.now.toISOString(),
        session: this.session,
      },
      replies: this.replies,
      effects: this.effects,
    };
  }

  private say(text: string): void {
    this.replies.push({ kind: "text", text, buttons: [] });
  }

  // --- input routing -------------------------------------------------------------------------

  private async dispatch(input: BotInput): Promise<void> {
    switch (input.kind) {
      case "follow": {
        this.showHome(true);
        return;
      }
      case "user_info":
        return this.onContact(input.phone, input.name);
      case "payload":
        return this.onPayload(input.payload);
      case "text":
        return this.onText(input.text);
    }
  }

  private async onPayload(raw: string): Promise<void> {
    const p = parsePayload(raw);
    switch (p.kind) {
      case "global":
        return this.runCommand(p.command);
      case "booking":
        return this.onBookingAction(p.action, p.bookingId);
      case "option": {
        const value = p.seq === this.state.seq ? this.state.options[p.index] : undefined;
        // A tap on an old message: show the current step again instead of guessing.
        if (value === undefined) return this.repeatStep();
        return this.onOption(value);
      }
      case "unknown":
        return this.onText(raw);
    }
  }

  private async onText(text: string): Promise<void> {
    const command = keywordCommand(text);
    if (command) return this.runCommand(command);
    const n = normalizeText(text);
    if (this.step.name === "phone") return this.onContact(normalizeVnPhone(text), null);
    if (/^\d{1,2}$/.test(n)) {
      const index = Number(n) - 1;
      if (index >= 0 && index < this.state.items) {
        const value = this.state.options[index];
        if (value !== undefined) return this.onOption(value);
      }
    }
    const typedTime = /^(\d{1,2})[:h.](\d{2})$/.exec(n);
    if (typedTime && this.step.name === "time") {
      const hhmm = `${typedTime[1]?.padStart(2, "0") ?? ""}:${typedTime[2] ?? ""}`;
      const value = this.state.options.find(
        (o) => o.startsWith("time:") && this.timeLabel(o.slice(5)) === hhmm,
      );
      if (value) return this.onOption(value);
    }
    const st = this.step;
    if (st.name === "day" || st.name === "time") {
      const when = parseWhen(text, this.today());
      if (when) return this.onWhen(st, when);
    }
    if (this.step.name === "idle") {
      this.showHome(true);
      return;
    }
    this.issue("not_understood");
    this.say(this.t("fallback"));
    return this.repeatStep();
  }

  private async runCommand(command: GlobalCommand): Promise<void> {
    switch (command) {
      case "menu": {
        this.endSession();
        this.showHome(false);
        return;
      }
      case "book":
        this.startSession();
        return this.showServices(0);
      case "mine":
        return this.showMyBookings();
      case "staff": {
        this.handoff();
        return;
      }
      case "bot": {
        this.endSession();
        this.showHome(false);
        return;
      }
    }
  }

  /**
   * Hands the chat to staff. The customer can always come back: the message carries
   * "Đặt lịch lại" + "Menu", and those (or a greeting) restart the bot while no staff member has
   * explicitly taken over (InboundService).
   */
  private handoff(): void {
    this.endSession("handoff");
    this.track({ event: "handoff" });
    this.effects.push({ type: "handoff" });
    this.terminal(this.t("handoff"));
  }

  /** Every message that ends a flow offers a way back in (owner rule, 2026-11-03). */
  private terminal(text: string, extra: { title: string; value: string }[] = []): void {
    this.step = { name: "idle" };
    this.menu = {
      text,
      items: 0,
      options: [
        ...extra,
        { title: this.t("bookAgain"), value: globalPayload("book") },
        { title: this.t("menu.home"), value: globalPayload("menu") },
      ],
    };
  }

  // --- options -------------------------------------------------------------------------------

  private async onOption(value: string): Promise<void> {
    if (value.startsWith("gg|")) return this.onPayload(value);
    const [kind, arg] = splitOnce(value);
    const step = this.step;
    switch (kind) {
      case "svc":
        return this.pickService(arg);
      case "var":
        if (step.name === "variant") return this.pickVariant(step.serviceId, arg || null);
        break;
      case "staff":
        if (step.name === "staff") {
          return this.afterStaff({
            serviceId: step.serviceId,
            variantId: step.variantId,
            staffId: arg === "any" ? null : arg,
          });
        }
        break;
      case "addyes":
        if (step.name === "add_more") return this.showServices2(step.sel, 0);
        break;
      case "addno":
        if (step.name === "add_more") return this.showDays(step.sel, null, 0);
        break;
      case "svc2":
        if (step.name === "service2") return this.pickService2(step.sel, arg);
        break;
      case "var2":
        if (step.name === "variant2") return this.withSecond(step.sel, step.serviceId, arg || null);
        break;
      case "more":
        return this.nextPage();
      case "prev":
        return this.prevPage();
      case "part":
        if (step.name === "time" && isDayPart(arg)) {
          return this.showTimes(step.sel, step.date, 0, step.rescheduleId, arg);
        }
        break;
      case "otherpart":
        if (step.name === "time")
          return this.showTimes(step.sel, step.date, 0, step.rescheduleId, null);
        break;
      case "day":
        if (step.name === "day") return this.showTimes(step.sel, arg, 0, step.rescheduleId);
        break;
      case "otherday":
        if (step.name === "time") return this.showDays(step.sel, step.rescheduleId, 0);
        break;
      case "time":
        if (step.name === "time") return this.pickTime(step.sel, arg, step.rescheduleId);
        break;
      case "confirm":
        if (step.name === "confirm") return this.book(step.sel, step.startsAt);
        break;
      case "change":
        if (step.name === "confirm") {
          const date = this.localDate(step.startsAt);
          return this.showTimes(step.sel, date, 0, null);
        }
        break;
      case "abort": {
        this.endSession("cancelled");
        this.showHome(false);
        return;
      }
      case "cancel":
        return this.askCancel(arg);
      case "resched":
        return this.startReschedule(arg);
      case "cancelyes":
        if (step.name === "cancel_confirm") return this.cancel(step.bookingId);
        break;
      case "cancelno": {
        this.showHome(false);
        return;
      }
    }
    return this.repeatStep();
  }

  private async nextPage(): Promise<void> {
    const step = this.step;
    if (step.name === "service") return this.showServices(step.page + 1);
    if (step.name === "service2") return this.showServices2(step.sel, step.page + 1);
    if (step.name === "day") return this.showDays(step.sel, step.rescheduleId, step.page + 1);
    if (step.name === "time") {
      return this.showTimes(
        step.sel,
        step.date,
        step.page + 1,
        step.rescheduleId,
        step.part ?? "all",
      );
    }
    return this.repeatStep();
  }
  private async prevPage(): Promise<void> {
    const step = this.step;
    if (step.name === "day") return this.showDays(step.sel, step.rescheduleId, step.page - 1);
    if (step.name === "time") {
      return this.showTimes(
        step.sel,
        step.date,
        step.page - 1,
        step.rescheduleId,
        step.part ?? "all",
      );
    }
    return this.repeatStep();
  }

  private async repeatStep(): Promise<void> {
    const step = this.step;
    switch (step.name) {
      case "idle": {
        this.showHome(false);
        return;
      }
      case "service":
        return this.showServices(step.page);
      case "variant":
        return this.pickService(step.serviceId);
      case "staff":
        return this.pickVariant(step.serviceId, step.variantId);
      case "add_more": {
        this.askMore(step.sel);
        return;
      }
      case "service2":
        return this.showServices2(step.sel, step.page);
      case "variant2":
        return this.pickService2(step.sel, step.serviceId);
      case "day":
        return this.showDays(step.sel, step.rescheduleId, step.page);
      case "time":
        return this.showTimes(step.sel, step.date, step.page, step.rescheduleId, step.part ?? null);
      case "phone": {
        this.askPhone();
        return;
      }
      case "confirm":
        return this.showConfirm(step.sel, step.startsAt);
      case "my_bookings":
        return this.showMyBookings();
      case "cancel_confirm":
        return this.askCancel(step.bookingId);
    }
  }

  // --- steps ---------------------------------------------------------------------------------

  private showHome(greet: boolean): void {
    this.step = { name: "idle" };
    const salon = this.ports.salon.name;
    const text = greet
      ? this.name
        ? this.t("greeting", { name: this.name, salon })
        : this.t("greetingNoName", { salon })
      : this.t("greetingNoName", { salon });
    this.menu = {
      text,
      items: 0,
      options: [
        { title: this.t("menu.book"), value: globalPayload("book") },
        { title: this.t("menu.myBookings"), value: globalPayload("mine") },
        { title: this.t("menu.staff"), value: globalPayload("staff") },
      ],
    };
  }

  private async showServices(page: number): Promise<void> {
    const services = await this.ports.services();
    if (services.length === 0) {
      this.endSession("no_services");
      this.say(this.t("noServices"));
      this.handoff();
      return;
    }
    const { slice, hasMore, page: p } = paginate(services, page);
    this.step = { name: "service", page: p };
    const lines = slice.map((s, i) =>
      this.t("serviceLine", {
        index: i + 1,
        name: s.name,
        price: this.price(s.priceMinor, s.priceMaxMinor),
        minutes: s.durationMinutes,
      }),
    );
    this.menu = {
      text: [this.t("chooseService"), ...lines].join("\n"),
      items: slice.length,
      options: [
        ...slice.map((s) => ({ title: truncate(s.name), value: `svc:${s.id}` })),
        ...(hasMore ? [{ title: this.t("more"), value: "more" }] : []),
      ],
    };
  }

  private async pickService(serviceId: string): Promise<void> {
    const service = (await this.ports.services()).find((s) => s.id === serviceId);
    if (!service) return this.showServices(0);
    if (service.variants.length === 0) return this.pickVariant(service.id, null, service);
    this.step = { name: "variant", serviceId };
    const variants = service.variants.slice(0, PAGE_SIZE + 1);
    this.menu = {
      text: [
        this.t("chooseVariant", { service: service.name }),
        ...variants.map(
          (v, i) =>
            `${String(i + 1)}. ${v.name} · ${this.price(v.priceMinor, v.priceMaxMinor)} · ${String(v.durationMinutes)}'`,
        ),
      ].join("\n"),
      items: variants.length,
      options: variants.map((v) => ({ title: truncate(v.name), value: `var:${v.id}` })),
    };
  }

  private async pickVariant(
    serviceId: string,
    variantId: string | null,
    known?: BotService,
  ): Promise<void> {
    const service = known ?? (await this.ports.services()).find((s) => s.id === serviceId);
    if (!service) return this.showServices(0);
    if (variantId && !service.variants.some((v) => v.id === variantId)) {
      return this.pickService(serviceId);
    }
    if (this.ports.salon.hideStaffChoice) {
      return this.afterStaff({ serviceId, variantId, staffId: null });
    }
    const staff = await this.ports.staffFor(serviceId, variantId);
    if (staff.length <= 1) return this.afterStaff({ serviceId, variantId, staffId: null });
    this.reach("staff");
    this.step = { name: "staff", serviceId, variantId };
    const shown = staff.slice(0, PAGE_SIZE);
    this.menu = {
      text: [
        this.t("chooseStaff"),
        ...shown.map((s, i) => `${String(i + 1)}. ${s.name}`),
        `${String(shown.length + 1)}. ${this.t("anyStaff")}`,
      ].join("\n"),
      items: shown.length + 1,
      options: [
        ...shown.map((s) => ({ title: truncate(s.name), value: `staff:${s.id}` })),
        { title: this.t("anyStaff"), value: "staff:any" },
      ],
    };
  }

  // --- second service (booking engine M6.8; the bot offers at most two) ---------------------

  /** After the first service and staff: offer a second service when the salon allows it. */
  private async afterStaff(sel: Selection): Promise<void> {
    if (!this.ports.salon.multiService || sel.second) return this.showDays(sel, null, 0);
    const others = (await this.ports.services()).filter((s) => s.id !== sel.serviceId);
    if (others.length === 0) return this.showDays(sel, null, 0);
    this.askMore(sel);
  }

  private askMore(sel: Selection): void {
    this.step = { name: "add_more", sel };
    this.menu = {
      text: this.t("addService"),
      items: 0,
      options: [
        { title: this.t("addServiceYes"), value: "addyes" },
        { title: this.t("addServiceNo"), value: "addno" },
      ],
    };
  }

  private async showServices2(sel: Selection, page: number): Promise<void> {
    const services = (await this.ports.services()).filter((s) => s.id !== sel.serviceId);
    if (services.length === 0) return this.showDays(sel, null, 0);
    const { slice, hasMore, page: p } = paginate(services, page);
    this.step = { name: "service2", sel, page: p };
    const lines = slice.map((s, i) =>
      this.t("serviceLine", {
        index: i + 1,
        name: s.name,
        price: this.price(s.priceMinor, s.priceMaxMinor),
        minutes: s.durationMinutes,
      }),
    );
    this.menu = {
      text: [this.t("chooseSecondService"), ...lines].join("\n"),
      items: slice.length,
      options: [
        ...slice.map((s) => ({ title: truncate(s.name), value: `svc2:${s.id}` })),
        ...(hasMore ? [{ title: this.t("more"), value: "more" }] : []),
      ],
    };
  }

  private async pickService2(sel: Selection, serviceId: string): Promise<void> {
    const service = (await this.ports.services()).find(
      (s) => s.id === serviceId && s.id !== sel.serviceId,
    );
    if (!service) return this.showServices2(sel, 0);
    if (service.variants.length === 0) return this.withSecond(sel, service.id, null);
    this.step = { name: "variant2", sel, serviceId };
    const variants = service.variants.slice(0, PAGE_SIZE + 1);
    this.menu = {
      text: [
        this.t("chooseVariant", { service: service.name }),
        ...variants.map(
          (v, i) =>
            `${String(i + 1)}. ${v.name} · ${this.price(v.priceMinor, v.priceMaxMinor)} · ${String(v.durationMinutes)}'`,
        ),
      ].join("\n"),
      items: variants.length,
      options: variants.map((v) => ({ title: truncate(v.name), value: `var2:${v.id}` })),
    };
  }

  private async withSecond(
    sel: Selection,
    serviceId: string,
    variantId: string | null,
  ): Promise<void> {
    const service = (await this.ports.services()).find((s) => s.id === serviceId);
    if (!service || (variantId && !service.variants.some((v) => v.id === variantId))) {
      return this.pickService2(sel, serviceId);
    }
    return this.showDays({ ...sel, second: { serviceId, variantId } }, null, 0);
  }

  private async showDays(sel: Selection, rescheduleId: string | null, page: number): Promise<void> {
    const days = await this.ports.days(sel, rescheduleId);
    if (days.length === 0) return this.explainNoDays(sel, rescheduleId);
    const { visible, p, prev, next } = pageOf(days, page);
    if (!rescheduleId) this.reach("slot");
    this.step = { name: "day", sel, page: p, rescheduleId };
    this.menu = {
      text: [
        this.t("chooseDay"),
        ...days.map((d, i) => `${String(i + 1)}. ${this.dayLabel(d)}`),
        this.t("typeHint"),
      ].join("\n"),
      items: days.length,
      options: [
        ...days.map((d) => ({
          title: this.dayLabel(d),
          value: `day:${d}`,
          hidden: !visible.includes(d),
        })),
        ...(prev ? [{ title: this.t("prev"), value: "prev" }] : []),
        ...(next ? [{ title: this.t("next"), value: "more" }] : []),
      ],
    };
  }

  /** Says why nothing is free instead of a dead end (topic 07 unavailableReason). */
  private async explainNoDays(sel: Selection, rescheduleId: string | null): Promise<void> {
    const why = await this.ports.explainNoDays(sel);
    const staff = { title: this.t("menu.staff"), value: globalPayload("staff") };
    if (isSetupIssue(why.reason)) {
      if (!rescheduleId) this.endSession("not_bookable");
      this.effects.push({ type: "setup_issue", reason: why.reason });
      this.terminal(this.t("notBookable"), [staff]);
      return;
    }
    if (why.reason === "outside_booking_window") {
      if (!rescheduleId) this.endSession("no_slots");
      this.terminal(this.t("windowLimit", { days: why.windowDays }), [staff]);
      return;
    }
    const earliest = why.earliest.slice(0, MAX_BUTTONS - 2);
    if (earliest.length > 0) {
      const first = earliest[0] ?? "";
      this.step = {
        name: "time",
        sel,
        date: this.localDate(first),
        page: 0,
        rescheduleId,
        part: "all",
      };
      this.menu = {
        text: this.t("earliestOffer", { days: BOOKING_DAYS }),
        items: earliest.length,
        options: [
          ...earliest.map((s) => ({ title: this.whenShort(s), value: `time:${s}` })),
          staff,
          { title: this.t("menu.home"), value: globalPayload("menu") },
        ],
      };
      return;
    }
    if (!rescheduleId) this.endSession("no_slots");
    this.terminal(this.t("noDays", { days: BOOKING_DAYS }), [staff]);
  }

  /**
   * Free times of one day. Many times across the day → first pick a part of the day (sáng / chiều /
   * tối); then the times of that part, three per page with ‹ › — every time is also listed in the
   * text and can be typed ("3", "15:30").
   */
  private async showTimes(
    sel: Selection,
    date: string,
    page: number,
    rescheduleId: string | null,
    part: DayPart | "all" | null = null,
  ): Promise<void> {
    const slots = await this.ports.slots(sel, date, rescheduleId);
    if (slots.length === 0) return this.showDays(sel, rescheduleId, 0);
    const groups = DAY_PARTS.map((p) => ({
      part: p,
      slots: slots.filter((s) => dayPartOf(this.minuteOf(s)) === p),
    })).filter((g) => g.slots.length > 0);
    if (part === null && slots.length > MAX_BUTTONS && groups.length > 1) {
      this.step = { name: "time", sel, date, page: 0, rescheduleId, part: null };
      this.menu = {
        text: [this.t("chooseTimeOfDay", { date: this.dayLabel(date) }), this.t("typeHint")].join(
          "\n",
        ),
        items: groups.length,
        options: [
          ...groups.map((g) => ({
            title: this.t("partCount", { part: this.t(`part.${g.part}`), count: g.slots.length }),
            value: `part:${g.part}`,
          })),
          { title: this.t("otherDay"), value: "otherday" },
        ],
      };
      return;
    }
    const chosen =
      part !== null && part !== "all" ? groups.find((g) => g.part === part) : undefined;
    const list = chosen?.slots ?? slots;
    const { visible, p, prev, next } = pageOf(list, page);
    const extras = [
      ...(chosen && groups.length > 1 ? [{ title: this.t("otherPart"), value: "otherpart" }] : []),
      { title: this.t("otherDay"), value: "otherday" },
    ];
    const nav = [
      ...(prev ? [{ title: this.t("prev"), value: "prev" }] : []),
      ...(next ? [{ title: this.t("next"), value: "more" }] : []),
    ];
    const room = MAX_BUTTONS - visible.length - nav.length;
    this.step = {
      name: "time",
      sel,
      date,
      page: p,
      rescheduleId,
      part: chosen ? chosen.part : "all",
    };
    this.menu = {
      text: [
        chosen
          ? this.t("chooseTimePart", {
              part: this.t(`partLower.${chosen.part}`),
              date: this.dayLabel(date),
            })
          : this.t("chooseTime", { date: this.dayLabel(date) }),
        ...rows(list.map((s, i) => `${String(i + 1)}. ${this.timeLabel(s)}`)),
        this.t("typeHint"),
      ].join("\n"),
      items: list.length,
      options: [
        ...list.map((s) => ({
          title: this.timeLabel(s),
          value: `time:${s}`,
          hidden: !visible.includes(s),
        })),
        ...nav,
        ...extras.slice(0, Math.max(0, room)),
      ],
    };
  }

  /** "mai 15h", "thứ 7 sáng": jump to that day / part, or the nearest free times. */
  private async onWhen(
    st: Extract<BotStep, { name: "day" | "time" }>,
    when: ParsedWhen,
  ): Promise<void> {
    const { sel, rescheduleId } = st;
    const days = await this.ports.days(sel, rescheduleId);
    let date = when.date ?? (st.name === "time" ? st.date : null);
    if (!date && when.minute !== null) date = days[0] ?? null;
    if (!date) {
      this.say(this.t("fallback"));
      return this.repeatStep();
    }
    if (!days.includes(date)) {
      this.say(this.t("dayFull", { date: this.dayLabel(date) }));
      return this.showDays(sel, rescheduleId, 0);
    }
    if (when.minute === null) return this.showTimes(sel, date, 0, rescheduleId, when.part ?? null);
    const target = when.minute;
    const slots = await this.ports.slots(sel, date, rescheduleId);
    const exact = slots.find((s) => this.minuteOf(s) === target);
    if (exact) return this.pickTime(sel, exact, rescheduleId);
    const nearest = [...slots]
      .sort((a, b) => Math.abs(this.minuteOf(a) - target) - Math.abs(this.minuteOf(b) - target))
      .slice(0, 3)
      .sort();
    this.step = { name: "time", sel, date, page: 0, rescheduleId, part: "all" };
    const hh = `${String(Math.floor(target / 60)).padStart(2, "0")}:${String(target % 60).padStart(2, "0")}`;
    this.menu = {
      text: this.t("nearest", { time: hh, date: this.dayLabel(date) }),
      items: nearest.length,
      options: [
        ...nearest.map((s) => ({ title: this.timeLabel(s), value: `time:${s}` })),
        { title: this.t("otherDay"), value: "otherday" },
      ],
    };
  }

  private async pickTime(sel: Selection, startsAt: string, rescheduleId: string | null) {
    if (rescheduleId) return this.reschedule(rescheduleId, startsAt);
    if (!this.phone) {
      this.reach("phone");
      this.step = { name: "phone", sel, startsAt };
      this.askPhone();
      return;
    }
    return this.showConfirm(sel, startsAt);
  }

  private askPhone(): void {
    this.replies.push({
      kind: "request_info",
      title: this.t("shareInfoTitle"),
      subtitle: this.t("shareInfoSubtitle", { salon: this.ports.salon.name }),
    });
    this.say(this.t("askPhone"));
  }

  private async onContact(phone: string | null, name: string | null): Promise<void> {
    const normalized = phone ? normalizeVnPhone(phone) : null;
    if (name) this.name = name;
    if (normalized) this.phone = normalized;
    if (normalized || name) this.effects.push({ type: "contact", phone: normalized, name });
    const step = this.step;
    if (step.name !== "phone") return this.repeatStep();
    if (!normalized) {
      this.say(this.t("phoneInvalid"));
      return;
    }
    return this.showConfirm(step.sel, step.startsAt);
  }

  private async showConfirm(sel: Selection, startsAt: string): Promise<void> {
    const services = await this.ports.services();
    const service = services.find((s) => s.id === sel.serviceId);
    if (!service) return this.showServices(0);
    const variant = sel.variantId ? service.variants.find((v) => v.id === sel.variantId) : null;
    const second = this.secondOf(services, sel);
    const staffName = sel.staffId
      ? ((await this.ports.staffFor(sel.serviceId, sel.variantId)).find((s) => s.id === sel.staffId)
          ?.name ?? this.t("anyStaffName"))
      : this.t("anyStaffName");
    const priced = [variant ?? service, ...(second ? [second.priced] : [])];
    const min = priced.reduce((sum, p) => sum + p.priceMinor, 0);
    const ranged = priced.some((p) => p.priceMaxMinor !== null);
    const max = ranged
      ? priced.reduce((sum, p) => sum + (p.priceMaxMinor ?? p.priceMinor), 0)
      : null;
    const first = variant ? `${service.name} (${variant.name})` : service.name;
    this.reach("confirm");
    this.step = { name: "confirm", sel, startsAt };
    this.menu = {
      text: this.t("confirmSummary", {
        service: second ? `${first} + ${second.label}` : first,
        when: this.when(startsAt),
        staff: staffName,
        price: this.price(min, max),
      }),
      items: 0,
      options: [
        { title: this.t("confirm"), value: "confirm" },
        { title: this.t("changeTime"), value: "change" },
        { title: this.t("cancelFlow"), value: "abort" },
      ],
    };
  }

  /** The second service of the selection, for the summary (null when none or gone). */
  private secondOf(
    services: readonly BotService[],
    sel: Selection,
  ): { label: string; priced: { priceMinor: number; priceMaxMinor: number | null } } | null {
    if (!sel.second) return null;
    const svc = services.find((s) => s.id === sel.second?.serviceId);
    if (!svc) return null;
    const v = sel.second.variantId
      ? svc.variants.find((x) => x.id === sel.second?.variantId)
      : null;
    return { label: v ? `${svc.name} (${v.name})` : svc.name, priced: v ?? svc };
  }

  private async book(sel: Selection, startsAt: string): Promise<void> {
    if (!this.phone) {
      this.step = { name: "phone", sel, startsAt };
      this.askPhone();
      return;
    }
    const result = await this.ports.book(sel, startsAt, this.phone, this.name ?? this.phone);
    if (!result.ok) {
      if (result.reason === "slot_taken") {
        this.issue("slot_taken");
        this.say(this.t("slotTaken"));
        return this.showTimes(sel, this.localDate(startsAt), 0, null);
      }
      if (result.reason === "limit_reached") {
        this.endSession("limit_reached");
        this.terminal(this.t("limitReached"), [
          { title: this.t("menu.myBookings"), value: globalPayload("mine") },
        ]);
        return;
      }
      this.endSession("failed");
      this.say(this.t("bookingFailed"));
      this.handoff();
      return;
    }
    const b = result.booking;
    this.track({ event: "booked", sessionId: this.session?.id ?? null, bookingId: b.id });
    this.session = null;
    this.effects.push({ type: "notify", kind: "booking_created", bookingId: b.id });
    this.terminal(
      this.t(result.pending ? "bookedPending" : "booked", {
        ref: b.ref,
        service: b.serviceName,
        when: this.when(b.startsAt),
        salon: this.ports.salon.name,
      }),
    );
  }

  private async showMyBookings(): Promise<void> {
    const bookings = (await this.ports.upcoming()).slice(0, 2);
    if (bookings.length === 0) {
      this.step = { name: "idle" };
      this.menu = {
        text: this.t("myBookingsNone"),
        items: 0,
        options: [
          { title: this.t("menu.book"), value: globalPayload("book") },
          { title: this.t("menu.home"), value: globalPayload("menu") },
        ],
      };
      return;
    }
    this.step = { name: "my_bookings" };
    this.menu = {
      text: [this.t("myBookingsList"), ...bookings.map((b) => this.bookingLine(b))].join("\n"),
      items: 0,
      options: [
        ...bookings.flatMap((b) => [
          {
            title: truncate(this.t("rescheduleBooking", { ref: b.ref })),
            value: `resched:${b.id}`,
          },
          { title: truncate(this.t("cancelBooking", { ref: b.ref })), value: `cancel:${b.id}` },
        ]),
        { title: this.t("menu.home"), value: globalPayload("menu") },
      ],
    };
  }

  private async findUpcoming(bookingId: string): Promise<BotBooking | null> {
    return (await this.ports.upcoming()).find((b) => b.id === bookingId) ?? null;
  }

  private async onBookingAction(
    action: "confirm" | "cancel" | "resched",
    bookingId: string,
  ): Promise<void> {
    if (action === "cancel") return this.askCancel(bookingId);
    if (action === "resched") return this.startReschedule(bookingId);
    const booking = await this.findUpcoming(bookingId);
    if (!booking || (await this.ports.confirmAttendance(bookingId)) !== "ok") {
      this.say(this.t("bookingNotFound"));
      this.showHome(false);
      return;
    }
    this.effects.push({ type: "notify", kind: "booking_confirmed", bookingId });
    this.terminal(this.t("attendanceConfirmed"));
  }

  private async askCancel(bookingId: string): Promise<void> {
    const booking = await this.findUpcoming(bookingId);
    if (!booking) {
      this.say(this.t("bookingNotFound"));
      this.showHome(false);
      return;
    }
    this.step = { name: "cancel_confirm", bookingId };
    this.menu = {
      text: this.t("cancelAsk", { ref: booking.ref, when: this.when(booking.startsAt) }),
      items: 0,
      options: [
        { title: this.t("cancelYes"), value: "cancelyes" },
        { title: this.t("cancelNo"), value: "cancelno" },
      ],
    };
  }

  private async cancel(bookingId: string): Promise<void> {
    const booking = await this.findUpcoming(bookingId);
    const result = booking ? await this.ports.cancel(bookingId) : "not_found";
    this.step = { name: "idle" };
    if (result === "ok" && booking) {
      this.effects.push({ type: "notify", kind: "booking_cancelled", bookingId });
      this.terminal(this.t("cancelled", { ref: booking.ref }));
      return;
    }
    if (result === "too_late") {
      this.say(this.t("cancelTooLate"));
      this.handoff();
      return;
    }
    this.say(this.t("bookingNotFound"));
    this.showHome(false);
  }

  private async startReschedule(bookingId: string): Promise<void> {
    const booking = await this.findUpcoming(bookingId);
    if (!booking) {
      this.say(this.t("bookingNotFound"));
      this.showHome(false);
      return;
    }
    // The bot only models two services: a longer chain is moved by the salon (review L3).
    if ((booking.serviceCount ?? 1) > BOT_MAX_SERVICES) {
      this.say(this.t("rescheduleContactSalon"));
      this.handoff();
      return;
    }
    const sel: Selection = {
      serviceId: booking.serviceId,
      variantId: booking.variantId,
      staffId: booking.staffId,
      // A two-service booking moves as a whole (M6.8).
      second: booking.second ?? null,
    };
    return this.showDays(sel, bookingId, 0);
  }

  private async reschedule(bookingId: string, startsAt: string): Promise<void> {
    const result = await this.ports.reschedule(bookingId, startsAt);
    if (result.ok) {
      this.effects.push({ type: "notify", kind: "booking_rescheduled", bookingId });
      this.terminal(
        this.t("rescheduled", {
          ref: result.booking.ref,
          when: this.when(result.booking.startsAt),
        }),
      );
      return;
    }
    if (result.reason === "slot_taken") {
      const step = this.step;
      this.say(this.t("slotTaken"));
      if (step.name === "time") return this.showTimes(step.sel, step.date, 0, bookingId);
      this.showHome(false);
      return;
    }
    this.step = { name: "idle" };
    if (result.reason === "too_late") {
      this.say(this.t("rescheduleTooLate"));
      this.handoff();
      return;
    }
    this.say(this.t("bookingNotFound"));
    this.showHome(false);
  }

  // --- formatting ----------------------------------------------------------------------------

  private bookingLine(b: BotBooking): string {
    return this.t("bookingLine", {
      ref: b.ref,
      service: b.serviceName,
      when: this.when(b.startsAt),
    });
  }

  private price(min: number, max: number | null): string {
    const locale = this.deps.locale;
    return max !== null && max > min
      ? `${formatVND(min, locale)} – ${formatVND(max, locale)}`
      : formatVND(min, locale);
  }

  private tag(): string {
    return this.deps.locale === "vi" ? "vi-VN" : "en-GB";
  }

  /** "T3, 08/12" / "Tue, 08/12" — a YYYY-MM-DD date is a calendar day (no timezone shift). */
  private dayLabel(date: string): string {
    const d = new Date(`${date}T12:00:00Z`);
    const weekday = new Intl.DateTimeFormat(this.tag(), {
      weekday: "short",
      timeZone: "UTC",
    }).format(d);
    const dm = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    }).format(d);
    return `${weekday}, ${dm}`;
  }

  /** "14:30 · 20/11" for buttons (title ≤ 20 chars). */
  private whenShort(iso: string): string {
    return `${this.timeLabel(iso)} · ${this.localDate(iso).slice(8, 10)}/${this.localDate(iso).slice(5, 7)}`;
  }

  /** Minutes after midnight in the salon timezone. */
  private minuteOf(iso: string): number {
    const [h, m] = this.timeLabel(iso).split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }

  private today(): string {
    return this.localDate(this.deps.now.toISOString());
  }

  /** 24 h "14:30" in the salon timezone. */
  private timeLabel(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: this.ports.salon.timeZone,
    }).format(new Date(iso));
  }

  private localDate(iso: string): string {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: this.ports.salon.timeZone,
    }).format(new Date(iso));
  }

  private when(iso: string): string {
    return `${this.timeLabel(iso)}, ${this.dayLabel(this.localDate(iso))}`;
  }
}

function splitOnce(value: string): [string, string] {
  const i = value.indexOf(":");
  return i < 0 ? [value, ""] : [value.slice(0, i), value.slice(i + 1)];
}

function paginate<T>(list: readonly T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = page >= pages ? 0 : Math.max(0, page);
  const start = p * size;
  return {
    slice: list.slice(start, start + size),
    page: p,
    hasMore: list.length > size,
  };
}

/** Zalo button titles are short; long names are cut with an ellipsis. */
function truncate(title: string, max = 20): string {
  return title.length <= max ? title : `${title.slice(0, max - 1)}…`;
}

/** Three items per page plus ‹ › when needed; up to MAX_BUTTONS items fit on one page. */
function pageOf<T>(list: readonly T[], page: number) {
  if (list.length <= MAX_BUTTONS) return { visible: [...list], p: 0, prev: false, next: false };
  const size = MAX_BUTTONS - 2;
  const pages = Math.ceil(list.length / size);
  const p = Math.min(Math.max(0, page), pages - 1);
  return {
    visible: list.slice(p * size, p * size + size),
    p,
    prev: p > 0,
    next: p < pages - 1,
  };
}

/** Numbered items, three per line, so long lists stay short in the chat. */
function rows(items: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += 3) out.push(items.slice(i, i + 3).join("    "));
  return out;
}

const isDayPart = (v: string): v is DayPart => (DAY_PARTS as readonly string[]).includes(v);
