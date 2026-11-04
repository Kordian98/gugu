import { useRef, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

import { Icon, MIN_TOUCH, Text, color, opacity, radius } from "@gugu/design-system";

type Focusable = { focus?: () => void } | null;

/**
 * Bottom sheet on phones, centred dialog on desktop ("So sánh gói", "Cách tính"). One labelled
 * dialog: react-native-web's `Modal` is the `role="dialog"` element (it traps focus and closes on
 * Escape); the label is passed to it. Focus starts on the close button. The backdrop closes on tap
 * but is hidden from assistive tech and the tab order. Reduced motion → no slide.
 */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  desktop,
  reduce,
  children,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  desktop: boolean;
  reduce: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const close = useRef<Focusable>(null);
  const dialogLabel = { "aria-label": title } as object;
  return (
    <Modal
      {...dialogLabel}
      visible={open}
      transparent
      animationType={reduce ? "none" : desktop ? "fade" : "slide"}
      onRequestClose={onClose}
      onShow={() => {
        close.current?.focus?.();
      }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: desktop ? "center" : "flex-end",
          alignItems: "center",
        }}
      >
        <Pressable
          aria-hidden
          focusable={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: color.ink,
            opacity: opacity.backdrop,
          }}
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: desktop ? 620 : undefined,
            maxHeight: desktop ? "86%" : "88%",
            backgroundColor: color.canvas,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderBottomLeftRadius: desktop ? radius.xl : 0,
            borderBottomRightRadius: desktop ? radius.xl : 0,
            paddingTop: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 4,
              paddingBottom: 6,
            }}
          >
            <View accessibilityRole="header" style={{ flex: 1 }}>
              <Text role="display" size={28} lineHeight={36} color={color.ink}>
                {title}
              </Text>
            </View>
            <Pressable
              ref={(el) => {
                close.current = el;
              }}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              style={(state) => ({
                width: MIN_TOUCH,
                height: MIN_TOUCH,
                borderRadius: radius.pill,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: color.white,
                borderWidth: 1,
                borderColor: (state as { hovered?: boolean }).hovered
                  ? color.lilac700
                  : color.lineStrong,
              })}
            >
              <Icon name="close" size={18} color={color.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 14 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
