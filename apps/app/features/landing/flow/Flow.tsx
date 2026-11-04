import { useWindowDimensions } from "react-native";

import { StoryStatic } from "../StoryStatic";
import type { LandingNavActions } from "../useLandingNav";

/** Native: static chapters. Web uses Flow.web.tsx. */
export function Flow(_props: {
  nav: LandingNavActions;
  desktop: boolean;
  width: number;
  reduce: boolean;
}) {
  const { width } = useWindowDimensions();
  return <StoryStatic width={width} desktop={false} />;
}
