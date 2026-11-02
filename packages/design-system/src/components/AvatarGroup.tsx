import { Image, View, type ImageSourcePropType } from "react-native";

import { Surface } from "./Surface";
import { Text } from "./Text";

/** Avatar stack + count inside a white pill (social proof). `image` is a pre-composited stack. */
export function AvatarGroup({
  image,
  count,
  height,
  imageWidth,
}: {
  image: ImageSourcePropType;
  count: string;
  height: number;
  imageWidth: number;
}) {
  return (
    <Surface
      variant="pill"
      radius={height / 2}
      style={{
        height,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: height * 0.12,
        paddingRight: height * 0.35,
        gap: height * 0.1,
        alignSelf: "flex-start",
      }}
    >
      <View style={{ width: imageWidth, height: height * 0.85 }}>
        <Image source={image} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
      </View>
      <Text role="ui" size={height * 0.31} color="#3A2240">
        {count}
      </Text>
    </Surface>
  );
}
