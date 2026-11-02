import { Slot } from "expo-router";

// (admin) route group shell. Auth/role guards are UX only; the API enforces access (topic 05).
export default function AdminLayout() {
  return <Slot />;
}
