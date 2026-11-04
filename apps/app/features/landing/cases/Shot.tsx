import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen, screenSize, type ScreenName } from "../screens";
import type { Case } from "./data";

type T = (k: string, o?: Record<string, unknown>) => string;

const uri = (m: number) => Asset.fromModule(m).uri;

/**
 * One real CRM crop of the demo salon; phones get the phone crop (about 1:1), desktop the 3× crop,
 * zoomed into its top-left by `c.zoom` so the CRM text stays readable (the box keeps at most `c.box`
 * of the column width as height). `sizes` follows the zoom, so the file is never shown above its pixels.
 */
export function Shot({ c, mobile }: { c: Case; mobile: boolean }) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as T;
  const locale = useLocale();
  const [full, half] = mobile ? c.mshot : c.shot;
  const { w, h } = screenSize(locale, full);
  const srcSet = (a: ScreenName, b: ScreenName) =>
    `${uri(screen(locale, b))} ${String(Math.round((w * 2) / 3))}w, ${uri(screen(locale, a))} ${String(w)}w`;
  const caption = t(`flow.cases.${c.k}.shot`);
  const zoom = mobile ? 1 : c.zoom;
  // box height / width: the zoomed image's own ratio, capped at `box`
  const ratio = Math.min(c.box, (zoom * h) / w);
  const col = 640;
  return (
    <figure className="cx-shot">
      <span
        className={zoom > 1 ? "img z" : "img"}
        style={
          mobile
            ? undefined
            : { aspectRatio: String(1 / ratio), ["--z" as string]: String(zoom * 100) + "%" }
        }
      >
        <img
          src={uri(screen(locale, full))}
          srcSet={srcSet(full, half)}
          sizes={
            mobile
              ? "calc(100vw - 32px)"
              : `(max-width: 1279px) ${String(Math.round(52 * zoom))}vw, ${String(Math.round(col * zoom))}px`
          }
          width={w}
          height={h}
          alt={caption}
          decoding="async"
          loading="lazy"
        />
      </span>
      <figcaption>
        <b>{caption}</b>
        <small>{t("flow.cases.shotNote")}</small>
      </figcaption>
    </figure>
  );
}
