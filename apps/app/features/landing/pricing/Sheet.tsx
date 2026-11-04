import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

import { Icon, IconButton, Text, color, radius } from "@gugu/design-system";

/**
 * Bottom sheet on phones, centred dialog on desktop ("So sánh gói", "Cách tính"). RN `Modal` traps
 * focus and closes on Escape / back. Reduced motion → no slide.
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
  return (
    <Modal
      visible={open}
      transparent
      animationType={reduce ? "none" : desktop ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: desktop ? "center" : "flex-end",
          alignItems: "center",
        }}
      >
        <Pressable
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: color.ink,
            opacity: 0.42,
          }}
        />
        <View
          testID={testID}
          role="dialog"
          aria-modal
          aria-label={title}
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
            paddingTop: 10,
          }}
        >
          {desktop ? null : (
            <View
              style={{
                alignSelf: "center",
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: color.line,
              }}
            />
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 6,
            }}
          >
            <View accessibilityRole="header" style={{ flex: 1 }}>
              <Text role="display" size={28} lineHeight={34} color={color.ink}>
                {title}
              </Text>
            </View>
            <IconButton size={44} onPress={onClose} accessibilityLabel={closeLabel}>
              <Icon name="close" size={18} color={color.ink} />
            </IconButton>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 14 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
