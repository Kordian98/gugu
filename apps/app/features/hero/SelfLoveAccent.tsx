import { color } from "@gugu/design-system";

import { AccentText } from "./AccentText";

/** Native: static handwritten accent (the draw-on animation is web-only for now). */
export function SelfLoveAccent({ text, size }: { text: string; size: number }) {
  return (
    <AccentText
      text={text}
      role="script"
      size={size}
      lineHeight={size * 1.2}
      color={color.script}
      style={{ transform: [{ rotate: "-16deg" }] }}
    />
  );
}
