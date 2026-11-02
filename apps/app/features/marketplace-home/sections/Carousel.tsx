import { forwardRef, useImperativeHandle, useRef, type ComponentRef, type ReactNode } from "react";
import { ScrollView, type StyleProp, type ViewStyle } from "react-native";

export type CarouselHandle = { scrollBy: (dir: -1 | 1) => void };

/** Horizontal snap carousel; arrows call `scrollBy` (one item per step). */
export const Carousel = forwardRef<
  CarouselHandle,
  {
    itemWidth: number;
    gap: number;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    padding?: number;
  }
>(function Carousel({ itemWidth, gap, children, style, padding = 0 }, ref) {
  const sv = useRef<ComponentRef<typeof ScrollView>>(null);
  const x = useRef(0);
  useImperativeHandle(ref, () => ({
    scrollBy: (dir) => {
      const next = Math.max(0, x.current + dir * (itemWidth + gap));
      sv.current?.scrollTo({ x: next, animated: true });
    },
  }));
  return (
    <ScrollView
      ref={sv}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={itemWidth + gap}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={(e) => {
        x.current = e.nativeEvent.contentOffset.x;
      }}
      style={style}
      contentContainerStyle={{ gap, paddingHorizontal: padding, paddingVertical: 12 }}
    >
      {children}
    </ScrollView>
  );
});
