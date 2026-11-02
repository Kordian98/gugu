import { useWindowDimensions } from "react-native";

import { StoryStatic } from "../StoryStatic";

/** Native: the story as static chapters (no scroll scrubbing). Web uses Story.web.tsx. */
export function Story() {
  const { width } = useWindowDimensions();
  return <StoryStatic width={width} desktop={false} />;
}
