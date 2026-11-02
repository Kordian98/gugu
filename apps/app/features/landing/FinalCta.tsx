import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, Text, color } from "@gugu/design-system";

import { Container } from "./Section";
import { GradientBand } from "./GradientBand";
import type { LandingNavActions } from "./useLandingNav";

/** Closing call to action on the lilac → peach gradient band. */
export function FinalCta({ nav }: { nav: LandingNavActions }) {
  const { t } = useTranslation("landing");
  return (
    <Container className="py-16">
      <GradientBand>
        <View className="gap-5 p-8 min-[900px]:p-16">
          <View accessibilityRole="header" style={{ maxWidth: 760 }}>
            <Text role="display" size={44} lineHeight={50}>
              {t("cta.title")}
            </Text>
          </View>
          <Text size={18} lineHeight={27} color={color.ink2}>
            {t("cta.body")}
          </Text>
          <View className="gap-3 min-[900px]:flex-row">
            <Button
              label={t("cta.trial")}
              onPress={nav.trial}
              height={56}
              fontSize={16.5}
              paddingX={30}
              trailingArrow
            />
            <Button
              variant="outline"
              label={t("cta.signIn")}
              onPress={nav.signIn}
              height={56}
              fontSize={16}
              paddingX={28}
            />
          </View>
        </View>
      </GradientBand>
    </Container>
  );
}
