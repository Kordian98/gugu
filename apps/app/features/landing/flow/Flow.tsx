import { useWindowDimensions } from "react-native";

import { StoryStatic } from "../StoryStatic";

/** Native: static chapters. Web uses Flow.web.tsx. */
export function Flow() {
  const { width } = useWindowDimensions();
  return <StoryStatic width={width} desktop={false} />;
}
