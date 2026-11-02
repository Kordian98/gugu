import { View } from "react-native";

import { color } from "@gugu/design-system";

import { Wash } from "../sections/Wash";
import { useFavorites } from "../useFavorites";
import type { HomeNav } from "../useHomeNav";
import { DesktopBelow } from "./DesktopBelow";
import { DesktopHero } from "./DesktopHero";
import { DesktopNav } from "./Nav";

/**
 * Desktop homepage: a 1:1 artboard of ref-01 authored in reference pixels (2048 wide), scaled to the viewport.
 * Layer order matters: diorama (back) → copy, search card, nav (front).
 */
export function DesktopHome({ width, nav }: { width: number; nav: HomeNav }) {
  const u = Math.min(width, 2048) / 2048;
  const p = (v: number) => v * u;
  const favs = useFavorites();
  return (
    <View
      style={{
        width: p(2048),
        height: p(2100),
        alignSelf: "center",
        backgroundColor: color.canvas,
        overflow: "hidden",
      }}
    >
      <Wash x={p(-140)} y={p(520)} w={p(260)} h={p(300)} rgba="rgba(196,170,245,0.75)" />
      <Wash x={p(-80)} y={p(200)} w={p(200)} h={p(220)} rgba="rgba(247,190,205,0.55)" />
      <Wash x={p(1720)} y={p(1080)} w={p(520)} h={p(360)} rgba="rgba(214,196,250,0.55)" />
      <Wash x={p(-200)} y={p(1880)} w={p(700)} h={p(420)} rgba="rgba(250,205,215,0.65)" />
      <Wash x={p(600)} y={p(860)} w={p(1500)} h={p(220)} rgba="rgba(246,210,222,0.45)" />
      <DesktopHero p={p} nav={nav} />
      <DesktopBelow p={p} nav={nav} favs={favs} />
      <DesktopNav p={p} nav={nav} />
    </View>
  );
}
