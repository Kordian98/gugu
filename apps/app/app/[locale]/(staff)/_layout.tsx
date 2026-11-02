import { Slot } from "expo-router";

// (staff) route group shell. Auth/role guards are UX only; the API enforces access (topic 05).
export default function StaffLayout() {
  return <Slot />;
}
