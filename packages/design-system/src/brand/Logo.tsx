import { SvgXml } from "react-native-svg";

import { logoMonoXml, logoOnDarkXml, logoXml } from "./logoXml";

const RATIO = 868 / 351;
const XML = { color: logoXml, onDark: logoOnDarkXml, mono: logoMonoXml } as const;

/**
 * Official GuGu logo (design/branding, mask-free SVG so Safari renders the "g" counters correctly).
 * `tint` recolours the mono variant (e.g. white on the reception desk).
 */
export function Logo({
  height,
  variant = "color",
  tint,
}: {
  height: number;
  variant?: keyof typeof XML;
  tint?: string;
}) {
  const xml = tint !== undefined ? XML.mono.replace(/#2A1426/gi, tint) : XML[variant];
  return <SvgXml xml={xml} height={height} width={height * RATIO} />;
}

export const LOGO_ASPECT = RATIO;
