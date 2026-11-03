import { useEffect, useId, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { Avatar, Text, useCalm } from "@gugu/design-system";
import { DEFAULT_SALON_TIMEZONE, formatClock24 } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { minutesInZone } from "../data/dates";
import type { BookingStatus, StaffMember, TimelineItem } from "../data/types";

/** Grid snap for taps and drags (minutes). */
const SNAP = 15;

/** Pointer delta → whole columns and snapped minutes, clamped to the grid. */
function snapDrag(
  g: { col: number; cols: number; colWidth: number; pxPerMin: number },
  dx: number,
  dy: number,
) {
  return {
    dCols: g.colWidth
      ? Math.max(-g.col, Math.min(g.cols - 1 - g.col, Math.round(dx / g.colWidth)))
      : 0,
    dMin: Math.round(dy / g.pxPerMin / SNAP) * SNAP,
  };
}

const tone = (s: BookingStatus) => (s === "noShow" ? "completed" : s);

type Props = {
  staff: StaffMember[];
  items: TimelineItem[];
  startHour?: number | undefined;
  endHour?: number | undefined;
  hourHeight?: number | undefined;
  timeZone?: string | undefined;
  /** Minutes since local midnight for the "now" line (today only). */
  nowMinutes?: number | null | undefined;
  onPressItem?: ((id: string) => void) | undefined;
  /** Tap on an empty cell: staff column + snapped local start minute. */
  onPressSlot?: ((staffId: string, minutes: number) => void) | undefined;
  /** Desktop drag-to-reschedule (the server revalidates; a 409 reverts). */
  onMoveItem?: ((id: string, staffId: string, minutes: number) => void) | undefined;
  /** Drag on empty time draws a block; release reports staff + start/end minutes. */
  onCreateRange?: ((staffId: string, start: number, end: number) => void) | undefined;
  /** Snap for drag-to-create (salon slot granularity), minutes. */
  granularity?: number | undefined;
  /** Mouse: drag starts at once. Touch: long-press first so the page can still scroll. */
  pointer?: "mouse" | "touch" | undefined;
};

/**
 * Staff-column day timeline (ref crm-01): time gutter, one column per team member, coloured blocks
 * (lilac confirmed, pink in progress, peach pending, grey done/no-show), hatched breaks. It only
 * draws and reports gestures: the booking engine (06) decides what may move where.
 */
export function Timeline({
  staff,
  items,
  startHour = 9,
  endHour = 18,
  hourHeight = 46,
  timeZone = DEFAULT_SALON_TIMEZONE,
  nowMinutes,
  onPressItem,
  onPressSlot,
  onMoveItem,
  onCreateRange,
  granularity = SNAP,
  pointer = "mouse",
}: Props) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const [gridWidth, setGridWidth] = useState(0);
  const gutter = locale === "en" ? 76 : 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const pxPerMin = hourHeight / 60;
  const top = (d: Date) => (minutesInZone(d, timeZone) - startHour * 60) * pxPerMin;
  /** End minute; an end at local midnight counts as 24:00. */
  const endMin = (d: Date) => minutesInZone(d, timeZone) || 1440;
  const height = (endHour - startHour) * hourHeight;
  const label = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const colWidth = staff.length ? gridWidth / staff.length : 0;

  return (
    <View testID="crm-timeline">
      <View style={{ flexDirection: "row", paddingLeft: gutter, paddingBottom: 10 }}>
        {staff.map((s) => (
          <View
            key={s.id}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingLeft: 8,
              minWidth: 0,
            }}
          >
            <Avatar name={s.name} size={28} />
            <Text
              role="uiMedium"
              size={14}
              color={c.ink}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {s.name}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", height: height + 12 }}>
        <View style={{ width: gutter }}>
          {hours.map((h) => (
            <Text
              key={h}
              size={12}
              color={c.body}
              style={{ position: "absolute", top: (h - startHour) * hourHeight - 2, right: 10 }}
            >
              {label(h)}
            </Text>
          ))}
        </View>
        <View
          onLayout={(e) => {
            setGridWidth(e.nativeEvent.layout.width);
          }}
          style={{ flex: 1, flexDirection: "row", borderLeftWidth: 1, borderLeftColor: c.line }}
        >
          {hours.map((h) => (
            <View
              key={h}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (h - startHour) * hourHeight + 6,
                height: 1,
                backgroundColor: c.line,
              }}
            />
          ))}
          {staff.map((s, col) => (
            <View key={s.id} style={{ flex: 1, borderRightWidth: 1, borderRightColor: c.line }}>
              {onPressSlot || onCreateRange ? (
                <CreateLayer
                  staffId={s.id}
                  label={t("calendar.newFor", { name: s.name })}
                  startMin={startHour * 60}
                  endMin={endHour * 60}
                  pxPerMin={pxPerMin}
                  granularity={granularity}
                  pointer={pointer}
                  onTap={(minutes) => {
                    onPressSlot?.(s.id, minutes);
                  }}
                  onRange={
                    onCreateRange
                      ? (a, b) => {
                          onCreateRange(s.id, a, b);
                        }
                      : undefined
                  }
                />
              ) : null}
              {items
                .filter(
                  (i) =>
                    i.staffId === s.id &&
                    endMin(i.end) > startHour * 60 &&
                    minutesInZone(i.start, timeZone) < endHour * 60,
                )
                .map((i) => {
                  // Clip to the visible hours so nothing paints outside the grid.
                  const y0 = Math.max(0, top(i.start));
                  const y1 = Math.min(height, (endMin(i.end) - startHour * 60) * pxPerMin);
                  const y = y0 + 8;
                  const h = Math.max(y1 - y0 - 4, 22);
                  return i.kind === "break" ? (
                    <BreakBlock key={i.id} y={y} h={h} label={i.label ?? t("timeline.break")} />
                  ) : (
                    <BookingBlock
                      key={i.id}
                      item={i}
                      y={y}
                      h={h}
                      col={col}
                      cols={staff.length}
                      colWidth={colWidth}
                      pxPerMin={pxPerMin}
                      timeZone={timeZone}
                      onPress={onPressItem}
                      onMove={
                        // A chain moves by its first block (06 M6.8: reschedule moves every line).
                        onMoveItem && (i.chain?.index ?? 1) === 1
                          ? (dCols, dMin) => {
                              const target =
                                staff[Math.min(staff.length - 1, Math.max(0, col + dCols))];
                              const start = minutesInZone(i.start, timeZone) + dMin;
                              if (target && (dCols !== 0 || dMin !== 0)) {
                                onMoveItem(i.bookingId ?? i.id, target.id, start);
                              }
                            }
                          : undefined
                      }
                    />
                  );
                })}
            </View>
          ))}
          {nowMinutes !== null &&
          nowMinutes !== undefined &&
          nowMinutes >= startHour * 60 &&
          nowMinutes <= endHour * 60 ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (nowMinutes - startHour * 60) * pxPerMin + 6,
                height: 2,
                backgroundColor: c.accentBg,
              }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function BookingBlock({
  item,
  y,
  h,
  col,
  cols,
  colWidth,
  pxPerMin,
  timeZone,
  onPress,
  onMove,
}: {
  item: Extract<TimelineItem, { kind: "booking" }>;
  y: number;
  h: number;
  col: number;
  cols: number;
  colWidth: number;
  pxPerMin: number;
  timeZone: string;
  onPress?: ((id: string) => void) | undefined;
  onMove?: ((dCols: number, dMin: number) => void) | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const moved = useRef(false);
  const geometry = useRef({ col, cols, colWidth, pxPerMin, onMove });
  useEffect(() => {
    geometry.current = { col, cols, colWidth, pxPerMin, onMove };
  }, [col, cols, colWidth, pxPerMin, onMove]);
  // The responder is created once; its callbacks read the latest geometry from the ref (updated in an
  // effect) and only run in event handlers, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        moved.current = true;
      },
      onPanResponderMove: (_e, g) => {
        setDrag({ dx: g.dx, dy: g.dy });
      },
      onPanResponderRelease: (_e, g) => {
        setDrag(null);
        const s = snapDrag(geometry.current, g.dx, g.dy);
        geometry.current.onMove?.(s.dCols, s.dMin);
        setTimeout(() => {
          moved.current = false;
        }, 0);
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        moved.current = false;
      },
    }),
  );
  const ev = c.event[tone(item.status)];
  const status = t(`timeline.status.${item.status}`);
  const shown = drag ? snapDrag({ col, cols, colWidth, pxPerMin }, drag.dx, drag.dy) : null;
  // 24-hour like the hour column beside it (en too).
  const time = formatClock24(item.start, locale, timeZone);
  // Multi-service booking: "1/2" marks each staff member's part of the same appointment.
  const part = item.chain ? t("timeline.chainPart", item.chain) : null;
  const label = part ? `${item.service} · ${part}` : item.service;
  return (
    <View
      {...(onMove ? pan.panHandlers : {})}
      style={{
        position: "absolute",
        top: y,
        left: 4,
        right: 4,
        height: h,
        zIndex: drag ? 20 : 1,
        transform: shown
          ? [{ translateX: shown.dCols * colWidth }, { translateY: shown.dMin * pxPerMin }]
          : [],
        opacity: drag ? 0.85 : 1,
      }}
    >
      <Pressable
        testID={`crm-booking-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${time} ${label}, ${item.customer}, ${status}`}
        onPress={() => {
          if (!moved.current) onPress?.(item.bookingId ?? item.id);
        }}
        style={{
          flex: 1,
          borderRadius: 8,
          borderLeftWidth: 3,
          borderLeftColor: ev.border,
          backgroundColor: ev.bg,
          paddingHorizontal: 8,
          paddingVertical: 5,
          overflow: "hidden",
          gap: 1,
        }}
      >
        {h < 40 ? (
          <Text size={12} color={ev.text} numberOfLines={1}>
            {`${time} · ${label}`}
          </Text>
        ) : (
          <>
            <Text size={12} color={ev.text} numberOfLines={1}>
              {time}
            </Text>
            <Text role="uiSemiBold" size={13} color={ev.text} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
        {h > 56 ? (
          <Text size={12} color={ev.text} numberOfLines={1}>
            {item.customer}
          </Text>
        ) : null}
        {h > 76 ? (
          <View
            style={{
              alignSelf: "flex-start",
              marginTop: 3,
              paddingHorizontal: 7,
              paddingVertical: 1,
              borderRadius: 999,
              backgroundColor: c.surface,
            }}
          >
            <Text role="uiMedium" size={11} color={c.ink}>
              {status}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function BreakBlock({ y, h, label }: { y: number; h: number; label: string }) {
  const { c } = useCalm();
  const id = `hatch${useId().replace(/:/g, "")}`;
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel={label}
      style={{
        position: "absolute",
        top: y,
        left: 4,
        right: 4,
        height: h,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: c.event.break.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        width="100%"
        height="100%"
      >
        <Defs>
          <Pattern
            id={id}
            patternUnits="userSpaceOnUse"
            width={8}
            height={8}
            patternTransform="rotate(45)"
          >
            <Line x1={0} y1={0} x2={0} y2={8} stroke={c.event.break.hatch} strokeWidth={3} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <Text role="uiMedium" size={12} color={c.event.break.text}>
        {label}
      </Text>
    </View>
  );
}

const LONG_PRESS_MS = 350;
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Empty-time layer of one staff column: tap → New appointment at that time; drag (mouse at once,
 * touch after a long press) draws a block snapped to the salon granularity and reports the range.
 * Until a touch drag is armed the gesture yields to the scroll view.
 */
function CreateLayer({
  staffId,
  label,
  startMin,
  endMin,
  pxPerMin,
  granularity,
  pointer,
  onTap,
  onRange,
}: {
  staffId: string;
  label: string;
  startMin: number;
  endMin: number;
  pxPerMin: number;
  granularity: number;
  pointer: "mouse" | "touch";
  onTap: (minutes: number) => void;
  onRange?: ((start: number, end: number) => void) | undefined;
}) {
  const { c } = useCalm();
  const [draft, setDraftState] = useState<{ a: number; b: number } | null>(null);
  const draftRef = useRef<{ a: number; b: number } | null>(null);
  const setDraft = (d: { a: number; b: number } | null) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const g = useRef({ startMin, endMin, pxPerMin, granularity, pointer, onTap, onRange });
  useEffect(() => {
    g.current = { startMin, endMin, pxPerMin, granularity, pointer, onTap, onRange };
  }, [startMin, endMin, pxPerMin, granularity, pointer, onTap, onRange]);
  const st = useRef({
    y0: 0,
    armed: false,
    moved: false,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const minuteAt = (y: number, mode: "floor" | "round") => {
    const v = g.current;
    const raw = v.startMin + Math.max(0, y - 6) / v.pxPerMin;
    const snapped =
      (mode === "floor" ? Math.floor(raw / v.granularity) : Math.round(raw / v.granularity)) *
      v.granularity;
    return Math.min(v.endMin, Math.max(v.startMin, snapped));
  };
  // eslint-disable-next-line react-hooks/refs -- callbacks read refs only in event handlers.
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const s = st.current;
        s.y0 = e.nativeEvent.locationY;
        s.moved = false;
        s.armed = g.current.pointer === "mouse";
        if (!s.armed && g.current.onRange) {
          s.timer = setTimeout(() => {
            s.armed = true;
            const a = minuteAt(s.y0, "floor");
            setDraft({ a, b: a + g.current.granularity });
          }, LONG_PRESS_MS);
        }
      },
      onPanResponderMove: (_e, gs) => {
        const s = st.current;
        if (Math.abs(gs.dy) > 6) s.moved = true;
        if (!s.armed || !g.current.onRange) {
          if (s.moved && s.timer) clearTimeout(s.timer);
          return;
        }
        const a = minuteAt(s.y0, "floor");
        const b = minuteAt(s.y0 + gs.dy, "round");
        setDraft(
          b >= a
            ? { a, b: Math.max(b, a + g.current.granularity) }
            : { a: b, b: a + g.current.granularity },
        );
      },
      onPanResponderTerminationRequest: () => !st.current.armed,
      onPanResponderRelease: () => {
        const s = st.current;
        if (s.timer) clearTimeout(s.timer);
        const d = draftRef.current;
        if (s.armed && s.moved && d && g.current.onRange) g.current.onRange(d.a, d.b);
        else if (!s.moved) g.current.onTap(minuteAt(s.y0, "floor"));
        setDraft(null);
        s.armed = false;
      },
      onPanResponderTerminate: () => {
        const s = st.current;
        if (s.timer) clearTimeout(s.timer);
        s.armed = false;
        setDraft(null);
      },
    }),
  );
  return (
    <View
      testID={`crm-slot-${staffId}`}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      {...pan.panHandlers}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {draft ? (
        <View
          testID="crm-draft-block"
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 4,
            right: 4,
            top: (draft.a - startMin) * pxPerMin + 8,
            height: Math.max((draft.b - draft.a) * pxPerMin - 4, 18),
            borderRadius: 8,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: c.accentBg,
            backgroundColor: c.accentSoft,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text role="uiSemiBold" size={12} color={c.accent}>
            {`${clock(draft.a)}–${clock(draft.b)}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
