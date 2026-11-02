/** Soft radial colour wash (web): matches the pink/lilac glows in ref-01. Values in device px. */
export function Wash({
  x,
  y,
  w,
  h,
  rgba,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  rgba: string;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: "50%",
        pointerEvents: "none",
        background: `radial-gradient(closest-side, ${rgba}, transparent)`,
      }}
    />
  );
}
