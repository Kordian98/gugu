import { Slot } from "expo-router";

// (public) route group shell. Auth/role guards are UX only; the API enforces access (topic 05).
export default function PublicLayout() {
  return <Slot />;
}
