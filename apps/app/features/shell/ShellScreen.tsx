import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

export type ShellArea = "public" | "customer" | "business" | "staff" | "admin";

type Props = { area: ShellArea };

const SEPARATOR = " · ";

/**
 * Architecture shell screen (01-A3): proves the same component renders on iOS, Android and web
 * inside each route group. It shows only identifiers, so it needs no translations.
 */
export function ShellScreen({ area }: Props) {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  return (
    <View
      testID="shell-screen"
      className="flex-1 items-center justify-center gap-3 bg-white dark:bg-neutral-950"
    >
      <Text className="text-5xl font-extrabold text-pink-600">GuGu</Text>
      <Text testID="shell-meta" className="font-mono text-sm text-neutral-500">
        {[locale, area].join(SEPARATOR)}
      </Text>
    </View>
  );
}
