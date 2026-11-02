import Svg, { Circle, Path } from "react-native-svg";

import { color as tokens } from "../tokens";

export type IconName =
  | "search"
  | "chevronRight"
  | "chevronLeft"
  | "chevronDown"
  | "chevronUp"
  | "arrowRight"
  | "pin"
  | "heart"
  | "star"
  | "home"
  | "calendar"
  | "clipboard"
  | "users"
  | "tag"
  | "team"
  | "box"
  | "chart"
  | "settings"
  | "bell"
  | "plus"
  | "sparkles"
  | "upload"
  | "check"
  | "sun"
  | "moon"
  | "menu"
  | "clock"
  | "store"
  | "more"
  | "close"
  | "arrowUp"
  | "arrowDown"
  | "trash"
  | "link"
  | "chat";

type Props = {
  name: IconName;
  size: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
};

/** Line icon set (24×24 grid, round caps) shared by the marketing pages and the calm CRM. */
export function Icon({ name, size, color = tokens.ink, strokeWidth = 2, filled = false }: Props) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "search" && (
        <>
          <Circle cx={11} cy={11} r={7} {...common} />
          <Path d="m20 20-3.6-3.6" {...common} />
        </>
      )}
      {name === "chevronRight" && <Path d="m9 5 7 7-7 7" {...common} />}
      {name === "chevronLeft" && <Path d="m15 5-7 7 7 7" {...common} />}
      {name === "chevronDown" && <Path d="m6 9 6 6 6-6" {...common} />}
      {name === "chevronUp" && <Path d="m6 15 6-6 6 6" {...common} />}
      {name === "arrowRight" && <Path d="M5 12h14M13 6l6 6-6 6" {...common} />}
      {name === "pin" && (
        <>
          <Path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z" {...common} />
          <Circle cx={12} cy={9.5} r={2.5} {...common} />
        </>
      )}
      {name === "star" && (
        <Path
          d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      )}
      {name === "heart" && (
        <Path
          d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"
          {...common}
          fill={filled ? color : "none"}
        />
      )}
      {name === "home" && (
        <Path
          d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z"
          {...common}
        />
      )}
      {name === "calendar" && (
        <>
          <Path
            d="M6.5 5.5h11A2.5 2.5 0 0 1 20 8v9.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5V8a2.5 2.5 0 0 1 2.5-2.5Z"
            {...common}
          />
          <Path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" {...common} />
        </>
      )}
      {name === "clipboard" && (
        <>
          <Path
            d="M7.5 4.5h9A2.5 2.5 0 0 1 19 7v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18V7a2.5 2.5 0 0 1 2.5-2.5Z"
            {...common}
          />
          <Path d="M9 4.5v-1h6v1M8.5 10h7M8.5 14h7M8.5 17.5h4" {...common} />
        </>
      )}
      {name === "chat" && (
        <Path
          d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17h0A2.5 2.5 0 0 1 3 14.5v-7A2.5 2.5 0 0 1 5.5 5Z"
          {...common}
        />
      )}
      {name === "users" && (
        <>
          <Circle cx={9.5} cy={8.5} r={3.5} {...common} />
          <Path d="M3 20c.6-3.6 3.2-5.5 6.5-5.5S15.4 16.4 16 20" {...common} />
          <Path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.8c1.7.7 2.7 2.4 3 5.2" {...common} />
        </>
      )}
      {name === "tag" && (
        <>
          <Path
            d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.3 6.3a1.4 1.4 0 0 1-2 0l-8.7-7.9Z"
            {...common}
          />
          <Circle cx={8} cy={8} r={1.4} {...common} />
        </>
      )}
      {name === "team" && (
        <>
          <Circle cx={12} cy={7.5} r={3.2} {...common} />
          <Path d="M6 20c.5-3.5 2.8-5.5 6-5.5s5.5 2 6 5.5" {...common} />
          <Circle cx={4.8} cy={10} r={2} {...common} />
          <Circle cx={19.2} cy={10} r={2} {...common} />
        </>
      )}
      {name === "box" && (
        <>
          <Path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4v-9Z" {...common} />
          <Path d="m4 7.5 8 4 8-4M12 11.5v9" {...common} />
        </>
      )}
      {name === "chart" && <Path d="M4 20h16M7 16.5V11M12 16.5V6.5M17 16.5v-4" {...common} />}
      {name === "settings" && (
        <>
          <Circle cx={12} cy={12} r={3} {...common} />
          <Path
            d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"
            {...common}
          />
        </>
      )}
      {name === "bell" && (
        <>
          <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" {...common} />
          <Path d="M10 20.5a2.2 2.2 0 0 0 4 0" {...common} />
        </>
      )}
      {name === "plus" && <Path d="M12 5v14M5 12h14" {...common} />}
      {name === "sparkles" && (
        <>
          <Path
            d="M10 3.5 11.6 8 16 9.5l-4.4 1.6L10 15.5 8.4 11.1 4 9.5 8.4 8 10 3.5Z"
            {...common}
          />
          <Path d="M17.5 14v5M15 16.5h5" {...common} />
        </>
      )}
      {name === "upload" && (
        <Path
          d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"
          {...common}
        />
      )}
      {name === "check" && <Path d="m5 12.5 4.5 4.5L19 7.5" {...common} />}
      {name === "sun" && (
        <>
          <Circle cx={12} cy={12} r={4} {...common} />
          <Path
            d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
            {...common}
          />
        </>
      )}
      {name === "moon" && <Path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" {...common} />}
      {name === "menu" && <Path d="M4 7h16M4 12h16M4 17h16" {...common} />}
      {name === "clock" && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 7.5V12l3 2" {...common} />
        </>
      )}
      {name === "store" && (
        <>
          <Path
            d="M4 9.5 5.5 4.5h13L20 9.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0Z"
            {...common}
          />
          <Path d="M5.5 11.5V20h13v-8.5M10 20v-4.5h4V20" {...common} />
        </>
      )}
      {name === "close" && <Path d="M6 6l12 12M18 6 6 18" {...common} />}
      {name === "arrowUp" && <Path d="M12 19V5M6 11l6-6 6 6" {...common} />}
      {name === "arrowDown" && <Path d="M12 5v14M6 13l6 6 6-6" {...common} />}
      {name === "trash" && (
        <Path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" {...common} />
      )}
      {name === "link" && (
        <Path
          d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
          {...common}
        />
      )}
      {name === "more" && (
        <>
          <Circle cx={6} cy={12} r={1.4} fill={color} />
          <Circle cx={12} cy={12} r={1.4} fill={color} />
          <Circle cx={18} cy={12} r={1.4} fill={color} />
        </>
      )}
    </Svg>
  );
}
