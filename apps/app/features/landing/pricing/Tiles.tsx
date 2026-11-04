import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, View, type ViewStyle } from "react-native";

import {
  Icon,
  Text,
  checkableA11y,
  color,
  motion,
  radius,
  elevation,
  space,
  type IconName,
} from "@gugu/design-system";

import { useRoving } from "./useRoving";

const NATIVE_DRIVER = Platform.OS !== "web";

export type TileOption<T extends string> = { value: T; label: string; icon: IconName };

/** Springs 0 → 1 whenever `trigger` changes (not on mount; instant with reduced motion). */
function usePopOnChange(trigger: string, reduce: boolean) {
  const [v] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      return;
    }
    v.setValue(0.3);
    Animated.spring(v, {
      toValue: 1,
      ...motion.spring.pop,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [trigger, reduce, v]);
  return v;
}

/**
 * Desktop question step: a numbered badge with a small "chosen" check (every step starts answered:
 * the defaults preselect all three), a friendly question, and compact one-tap icon tiles in one
 * row (radio group, roving tabindex + arrows/Home/End). A rail connects the steps.
 */
export function StepQuestion<T extends string>({
  n,
  question,
  options,
  value,
  onChange,
  last,
  reduce,
  testID,
}: {
  n: number;
  question: string;
  options: readonly TileOption<T>[];
  value: T;
  onChange: (v: T) => void;
  last: boolean;
  reduce: boolean;
  testID?: string;
}) {
  const roving = useRoving(
    options.map((o) => o.value),
    value,
    onChange,
  );
  const pop = usePopOnChange(value, reduce);
  return (
    <View style={{ flexDirection: "row", gap: space[4] }}>
      {/* Rail: step number + chosen check + connector (decorative). */}
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 28, alignItems: "center" }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color.ink,
          }}
        >
          <Text role="uiSemiBold" size={13} color={color.white}>
            {n}
          </Text>
          <Animated.View
            style={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: 16,
              height: 16,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: color.pink300,
              borderWidth: 2,
              borderColor: color.canvas,
              transform: [{ scale: pop }],
            }}
          >
            <Icon name="check" size={8} color={color.plum950} strokeWidth={3.4} />
          </Animated.View>
        </View>
        {last ? null : (
          <View
            style={{
              flex: 1,
              width: 2,
              marginTop: space[2],
              borderRadius: 1,
              backgroundColor: color.lilac300,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, gap: space[2], paddingBottom: last ? 0 : space[5] }}>
        <Text role="uiSemiBold" size={16} lineHeight={24} color={color.ink}>
          {question}
        </Text>
        <View
          testID={testID}
          role="radiogroup"
          aria-label={question}
          accessibilityLabel={question}
          style={{ flexDirection: "row", gap: space[2] }}
        >
          {options.map((o, i) => (
            <Tile
              key={o.value}
              option={o}
              selected={o.value === value}
              onPress={() => {
                onChange(o.value);
              }}
              roving={roving(i)}
              reduce={reduce}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function Tile<T extends string>({
  option,
  selected,
  onPress,
  roving,
  reduce,
}: {
  option: TileOption<T>;
  selected: boolean;
  onPress: () => void;
  roving: object;
  reduce: boolean;
}) {
  const pop = usePopOnChange(selected ? "on" : "off", reduce);
  return (
    <Pressable
      {...roving}
      {...checkableA11y("radio", selected)}
      accessibilityLabel={option.label}
      onPress={onPress}
      style={(state): ViewStyle => {
        const hovered = (state as { hovered?: boolean }).hovered === true && !selected;
        return {
          flex: 1,
          minHeight: 64,
          flexDirection: "row",
          alignItems: "center",
          gap: space[2],
          paddingHorizontal: space[3],
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: selected ? color.ink : hovered ? color.lilac700 : color.lineStrong,
          backgroundColor: selected ? color.ink : color.white,
          ...(hovered || selected ? elevation.raised : {}),
          transform: [{ translateY: hovered ? -2 : 0 }, { scale: state.pressed ? 0.97 : 1 }],
        };
      }}
    >
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? color.pink300 : color.lilac100,
        }}
      >
        <Icon name={option.icon} size={19} color={selected ? color.plum950 : color.lilac700} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          role="uiSemiBold"
          size={15.5}
          lineHeight={21}
          color={selected ? color.white : color.ink}
          numberOfLines={1}
        >
          {option.label}
        </Text>
      </View>
      {selected ? (
        <Animated.View
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            top: -space[2],
            right: -space[2],
            width: 22,
            height: 22,
            borderRadius: radius.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color.pink300,
            borderWidth: 2,
            borderColor: color.canvas,
            transform: [{ scale: pop }],
          }}
        >
          <Icon name="check" size={12} color={color.plum950} strokeWidth={3} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}
