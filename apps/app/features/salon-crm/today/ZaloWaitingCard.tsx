import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, Text, useCalm } from "@gugu/design-system";

import { useZaloAttention } from "../data/zalo";
import { useCrmNav } from "../shell/useCrmNav";

/** Today: "Customers waiting on Zalo" — shown only while someone waits for a person (topic 09). */
export function ZaloWaitingCard() {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const { go } = useCrmNav();
  const attention = useZaloAttention();
  const data = attention.data;
  if (!data || data.waiting === 0) return null;
  const first = data.items[0];
  const open = () => {
    go(first ? `/business/zalo?c=${first.conversationId}` : "/business/zalo");
  };
  return (
    <CalmCard testID="today-zalo-waiting" style={{ gap: 10, borderColor: c.attention }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text role="uiSemiBold" size={15} color={c.ink} style={{ flex: 1 }}>
          {t("panel.today.title")}
        </Text>
        <Pill label={String(data.waiting)} tone="down" />
      </View>
      <Text size={13} color={c.body}>
        {t("panel.today.body", { count: data.waiting })}
      </Text>
      {data.items.slice(0, 3).map((item) => (
        <Text key={item.conversationId} size={13} color={c.body} numberOfLines={1}>
          {item.displayName ?? t("panel.inbox.unknownCustomer")}
          {item.lastMessages.at(-1)?.text ? ` · ${item.lastMessages.at(-1)?.text ?? ""}` : ""}
        </Text>
      ))}
      <View style={{ flexDirection: "row" }}>
        <CalmButton icon="chat" label={t("panel.today.open")} onPress={open} />
      </View>
    </CalmCard>
  );
}
