import { useEffect, useMemo, useState } from "react";
import { Keyboard, PanResponder, Platform } from "react-native";

import { space } from "@gugu/design-system";

/** Only the header owns this gesture: scrolling or dragging a form can never close its draft. */
export function useSheetKeyboard() {
  const [keyboardVisible, setKeyboardVisible] = useState(
    () => Platform.OS !== "web" && Keyboard.isVisible(),
  );
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        setKeyboardVisible(true);
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardVisible(false);
      },
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const headerGesture = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Platform.OS !== "web" &&
          keyboardVisible &&
          gesture.dy > space[3] &&
          gesture.dy > Math.abs(gesture.dx) * 2,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > space[6]) Keyboard.dismiss();
        },
      }),
    [keyboardVisible],
  );
  return { keyboardVisible, headerGesture };
}
