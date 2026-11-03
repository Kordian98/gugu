import { Asset } from "expo-asset";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, screenSize, type ScreenName } from "../screens";

/**
 * A REAL CRM screen crop (scripts/landing-screens.mjs: 3× capture + `-2x` companion) in a captioned card.
 * `sizes` must match the displayed CSS width (see .bo-shot rules) so the browser never upscales.
 */
export function Shot({
  name,
  name2x,
  caption,
  sizes,
  className,
}: {
  name: ScreenName;
  name2x: ScreenName;
  caption: string;
  sizes: string;
  className: string;
}) {
  const locale = useLocale();
  const src = Asset.fromModule(screen(locale, name)).uri;
  const src2x = Asset.fromModule(screen(locale, name2x)).uri;
  const { w, h } = screenSize(locale, name);
  return (
    <figure className={`card bo-shot ${className}`}>
      <figcaption>{caption}</figcaption>
      <div className="bo-img">
        <img
          src={src}
          srcSet={`${src2x} ${String(Math.round((w * 2) / 3))}w, ${src} ${String(w)}w`}
          sizes={sizes}
          width={w}
          height={h}
          alt=""
          decoding="async"
          loading="lazy"
        />
      </div>
    </figure>
  );
}
