import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Logo, color } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { IMG } from "../assets";
import { AccentText } from "./AccentText";
import { Float } from "./Float";
import { HeroMedia } from "./HeroMedia";
import { Neon } from "./Neon";

const W = 1388; // diorama is authored in ref-01 pixels: 1388 × 980
const LOGO_RATIO = 351 / 868;

/**
 * The living ref-01 diorama: poster/loop media, the official logo on the reception desk, neon signage and
 * handwritten accents fitted to the wall planes (skewY measured from ref-01), and floating props.
 */
export function Diorama({
  width,
  fadeEdges = true,
  small = false,
  showProps = true,
}: {
  width: number;
  fadeEdges?: boolean;
  small?: boolean;
  showProps?: boolean;
}) {
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  const k = width / W;
  const p = (v: number) => v * k;
  const logoW = p(138);
  return (
    <View style={{ width, height: p(980) }}>
      <HeroMedia fadeEdges={fadeEdges} small={small} />
      {/* Reception desk: official logo (design/branding), angled with the desk face */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: p(864),
          top: p(653) - (logoW * LOGO_RATIO) / 2,
          opacity: 0.92,
          transformOrigin: "0% 50%",
          transform: [{ skewY: "19deg" }, { scaleX: 0.9 }],
          shadowColor: "#FFC4D6",
          shadowOpacity: 0.9,
          shadowRadius: p(8),
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <Logo height={logoW * LOGO_RATIO} tint="#FFFFFF" />
      </View>
      <View
        style={{
          position: "absolute",
          left: p(313),
          top: p(183),
          width: p(118),
          transformOrigin: "0 0",
          transform: [{ skewY: "-19.8deg" }],
        }}
        pointerEvents="none"
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", alignSelf: "flex-end" }}>
          <Neon size={p(32)} lineHeight={p(34)} style={{ textAlign: "right" }}>
            {t("home.sign.lives")}
          </Neon>
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          left: p(620),
          top: p(118),
          transformOrigin: "0 0",
          transform: [{ skewY: "-8.7deg" }],
        }}
        pointerEvents="none"
      >
        <Neon size={p(20)} lineHeight={p(20)} delay={4100} style={{ letterSpacing: p(20) * 0.16 }}>
          {t("home.sign.hair")}
        </Neon>
      </View>
      <View
        style={{
          position: "absolute",
          left: p(1046),
          top: p(336),
          transformOrigin: "0 0",
          transform: [{ skewY: "14.7deg" }],
        }}
        pointerEvents="none"
      >
        <Neon size={p(22)} lineHeight={p(29)} delay={5600}>
          {t("home.sign.skin")}
        </Neon>
      </View>
      <AccentText
        text={t("home.accent.pillar")}
        role="script"
        size={p(23)}
        lineHeight={p(26)}
        color="#2E1C3E"
        align={locale === "vi" ? "center" : "left"}
        heartScale={1.4}
        style={{
          position: "absolute",
          left: p(1262),
          top: p(478),
          width: p(locale === "vi" ? 96 : 120),
          transformOrigin: "0 0",
          transform: [{ rotate: "-8deg" }],
        }}
      />
      <AccentText
        text={t("home.accent.goodBeauty")}
        role="script"
        size={p(30)}
        lineHeight={p(30)}
        color={color.script}
        style={{
          position: "absolute",
          left: p(1240),
          top: p(locale === "en" ? 46 : 92),
          transformOrigin: "0 0",
          transform: [{ rotate: "14deg" }],
        }}
      />
      {showProps ? (
        <>
          <Float
            style={{
              position: "absolute",
              left: p(16),
              top: p(85),
              width: p(154),
              height: p(154 * 1.08),
            }}
            depth={p(22)}
          >
            <Image
              source={IMG.polish}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          </Float>
          <Float
            style={{
              position: "absolute",
              left: p(1155),
              top: p(670),
              width: p(233),
              height: p(233 * 1.1),
            }}
            depth={-p(16)}
            duration={6400}
            delay={1800}
          >
            <Image
              source={IMG.perfume}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          </Float>
        </>
      ) : null}
    </View>
  );
}
