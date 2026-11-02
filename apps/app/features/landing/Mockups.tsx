import type { ReactNode } from "react";
import { Image, View } from "react-native";

import { Text, color } from "@gugu/design-system";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, screenSize, type ScreenName } from "./screens";

const WINDOW_DOTS = ["#F4A3B4", "#F6D58E", "#B9E3B0"] as const;

/** Browser-style window framing a REAL CRM capture. */
export function ScreenFrame({ name, width }: { name: ScreenName; width: number }) {
  const locale = useLocale();
  const { w, h } = screenSize(locale, name);
  return (
    <View
      style={{
        width,
        borderRadius: 18,
        backgroundColor: color.white,
        borderWidth: 1,
        borderColor: color.lineSoft,
        overflow: "hidden",
        shadowColor: color.ink,
        shadowOpacity: 0.12,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 20 },
      }}
    >
      <View
        style={{
          height: 30,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          backgroundColor: "#FBF7F5",
          borderBottomWidth: 1,
          borderBottomColor: color.lineSoft,
        }}
      >
        {WINDOW_DOTS.map((c) => (
          <View key={c} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
        ))}
      </View>
      <Image
        source={screen(locale, name)}
        style={{ width, height: (width * h) / w }}
        resizeMode="cover"
      />
    </View>
  );
}

/** Phone outline for message examples (Zalo/email style — illustrative, not a third-party UI copy). */
export function PhoneFrame({ width, children }: { width: number; children: ReactNode }) {
  return (
    <View
      style={{
        width,
        aspectRatio: 0.52,
        borderRadius: width * 0.14,
        backgroundColor: "#1F1220",
        padding: width * 0.035,
        shadowColor: color.ink,
        shadowOpacity: 0.18,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 24 },
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: width * 0.11,
          backgroundColor: "#F6F1F8",
          overflow: "hidden",
          paddingTop: width * 0.12,
          paddingHorizontal: width * 0.05,
          gap: width * 0.035,
        }}
      >
        <View
          style={{
            position: "absolute",
            top: width * 0.035,
            alignSelf: "center",
            width: width * 0.3,
            height: width * 0.06,
            borderRadius: 99,
            backgroundColor: "#1F1220",
          }}
        />
        {children}
      </View>
    </View>
  );
}

/** Chat bubble: "in" = from the customer/user (left, white), "out" = from the salon/assistant (right, lilac). */
export function Bubble({
  text,
  side,
  size = 14,
  tone,
}: {
  text: string;
  side: "in" | "out";
  size?: number;
  tone?: "ai";
}) {
  const out = side === "out";
  return (
    <View
      style={{
        alignSelf: out ? "flex-end" : "flex-start",
        maxWidth: "86%",
        paddingHorizontal: size * 0.85,
        paddingVertical: size * 0.6,
        borderRadius: size * 1.2,
        borderBottomRightRadius: out ? size * 0.3 : size * 1.2,
        borderBottomLeftRadius: out ? size * 1.2 : size * 0.3,
        backgroundColor: tone === "ai" ? color.white : out ? color.lilac500 : color.white,
        borderWidth: tone === "ai" || !out ? 1 : 0,
        borderColor: color.lineSoft,
      }}
    >
      <Text
        size={size}
        lineHeight={size * 1.4}
        color={out && tone !== "ai" ? color.white : color.ink}
      >
        {text}
      </Text>
    </View>
  );
}

/** Small status pill. */
export function Tag({
  label,
  tone = "lilac",
}: {
  label: string;
  tone?: "lilac" | "red" | "ink" | "green";
}) {
  const bg = { lilac: color.lilac100, red: "#FDE2E4", ink: color.ink, green: "#E2F5E6" }[tone];
  const fg = { lilac: color.lilac700, red: "#C2414B", ink: color.white, green: "#2F7A43" }[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 99,
        backgroundColor: bg,
      }}
    >
      <Text role="uiSemiBold" size={12} color={fg}>
        {label}
      </Text>
    </View>
  );
}

/** TEMPORARY placeholder: a hand-written price list "photo" (the AI import screen is not built yet). */
export function PriceListCard({ width }: { width: number }) {
  const { t } = useTranslation("landing");
  return (
    <View
      style={{
        width,
        padding: 18,
        borderRadius: 10,
        backgroundColor: "#FFFBEF",
        borderWidth: 1,
        borderColor: "#EADFC2",
        transform: [{ rotate: "-2deg" }],
        gap: 6,
        shadowColor: color.ink,
        shadowOpacity: 0.1,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <Text role="eyebrow" size={11} color={color.muted}>
        {t("story.ai.photo")}
      </Text>
      <Text role="script" size={21} lineHeight={28} color="#3B2A45">
        {t("story.ai.list")}
      </Text>
    </View>
  );
}
