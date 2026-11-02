import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text, color } from "@gugu/design-system";

import { Bubble, PhoneFrame, Tag } from "./Mockups";

const NOTES = ["note1", "note2", "note3"] as const;

/** "Before" chapter: Zalo chats piling up, a paper notebook with clashing entries, no-shows. */
export function BeforeCollage({ width }: { width: number }) {
  const { t } = useTranslation("landing");
  const phoneW = width * 0.42;
  return (
    <View style={{ width, height: phoneW / 0.52, justifyContent: "center" }}>
      <View style={{ position: "absolute", left: 0, top: 0 }}>
        <PhoneFrame width={phoneW}>
          <View
            style={{
              alignSelf: "center",
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 99,
              backgroundColor: "#E5484D",
            }}
          >
            <Text role="uiSemiBold" size={11} color={color.white}>
              {t("story.before.unread")}
            </Text>
          </View>
          <Bubble side="in" size={12} text={t("story.before.chat")} />
          <Bubble side="in" size={12} text={t("story.before.chat2")} />
          <Bubble side="in" size={12} text={t("story.before.chat3")} />
        </PhoneFrame>
      </View>
      <View
        style={{
          position: "absolute",
          right: 0,
          top: phoneW * 0.25,
          width: width * 0.55,
          padding: 20,
          borderRadius: 10,
          backgroundColor: "#FFFBEF",
          borderWidth: 1,
          borderColor: "#EADFC2",
          transform: [{ rotate: "3deg" }],
          gap: 10,
          shadowColor: color.ink,
          shadowOpacity: 0.1,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        }}
      >
        {NOTES.map((k, i) => (
          <View
            key={k}
            style={{ borderBottomWidth: 1, borderBottomColor: "#E9DDBE", paddingBottom: 6 }}
          >
            <Text
              role="script"
              size={22}
              lineHeight={28}
              color={i === 1 ? "#B23A48" : "#3B2A45"}
              style={i === 1 ? { textDecorationLine: "line-through" } : undefined}
            >
              {t(`story.before.${k}`)}
            </Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          <Tag label={t("story.before.double")} tone="red" />
          <Tag label={t("story.before.noShow")} tone="red" />
        </View>
      </View>
    </View>
  );
}
