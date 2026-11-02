import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, Icon, Text, color } from "@gugu/design-system";

import { IMG } from "../assets";
import type { HomeNav } from "../useHomeNav";

const W = 383; // authored at 383 × 352 (ref-01)

/** Hero search card: tabs, location / service / date rows, "Find my glow". Scales with `width`. */
export function SearchCard({ width, nav }: { width: number; nav: HomeNav }) {
  const { t } = useTranslation("marketing");
  const [tab, setTab] = useState<"book" | "find">("book");
  const [labelW, setLabelW] = useState<Record<string, number>>({});
  const k = width / W;
  const p = (v: number) => v * k;
  const rows = [
    { key: "location", icon: IMG.icoPin, label: t("home.search.location"), top: 69 },
    { key: "service", icon: IMG.icoNail, label: t("home.search.service"), top: 134 },
    { key: "when", icon: IMG.icoCal, label: t("home.search.when"), top: 198 },
  ] as const;
  const tabs = [
    { id: "book", label: t("home.search.tabBook"), left: 52 },
    { id: "find", label: t("home.search.tabFind"), left: 246 },
  ] as const;
  return (
    <View
      accessibilityRole="search"
      style={{
        width,
        height: p(352),
        borderRadius: p(32),
        backgroundColor: color.white,
        shadowColor: color.ink,
        shadowOpacity: 0.1,
        shadowRadius: p(25),
        shadowOffset: { width: 0, height: p(9) },
      }}
    >
      {tabs.map((tb) => (
        <Pressable
          key={tb.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === tb.id }}
          onPress={() => {
            setTab(tb.id);
          }}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setLabelW((m) => (m[tb.id] === w ? m : { ...m, [tb.id]: w }));
          }}
          style={{ position: "absolute", left: p(tb.left), top: p(26), paddingVertical: p(4) }}
        >
          <Text
            role={tab === tb.id ? "uiSemiBold" : "uiMedium"}
            size={p(16.5)}
            color={tab === tb.id ? color.ink : "#6E5E7A"}
          >
            {tb.label}
          </Text>
        </Pressable>
      ))}
      {/* Active-tab underline: label width + 22 ref px either side (190 px for "Book a treatment" as in ref-01) */}
      <View
        style={{
          position: "absolute",
          left: p((tab === "book" ? 52 : 246) - 22),
          top: p(57),
          width: (labelW[tab] ?? p(146)) + p(44),
          height: Math.max(2, p(3)),
          borderRadius: 3,
          backgroundColor: "#8C80F5",
        }}
      />
      {rows.map((r) => (
        <Pressable
          key={r.key}
          accessibilityRole="button"
          accessibilityLabel={r.label}
          onPress={() => {
            nav.searchField(r.key);
          }}
          style={(s) => ({
            position: "absolute",
            left: p(24),
            top: p(r.top),
            width: p(337),
            height: p(54),
            borderRadius: p(14),
            borderWidth: 1,
            borderColor:
              (s as { hovered?: boolean }).hovered === true ? color.lilac500 : color.line,
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: p(14),
            paddingRight: p(20),
          })}
        >
          <Image source={r.icon} style={{ width: p(32), height: p(34) }} resizeMode="contain" />
          <View style={{ flex: 1, marginLeft: p(19) }}>
            <Text role="uiMedium" size={p(18.5)}>
              {r.label}
            </Text>
          </View>
          <Icon name="chevronRight" size={p(18)} strokeWidth={2.2} />
        </Pressable>
      ))}
      <Button
        label={t("home.search.cta")}
        onPress={() => {
          nav.findMyGlow(tab);
        }}
        height={p(62)}
        fontSize={p(20.5)}
        width={p(337)}
        trailingArrow
        style={{ position: "absolute", left: p(24), top: p(264) }}
      />
    </View>
  );
}
