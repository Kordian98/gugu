import { Slot } from "expo-router";

// (business) route group shell. Auth/role guards are UX only; the API enforces access (topic 05).
export default function BusinessLayout() {
  return <Slot />;
}
