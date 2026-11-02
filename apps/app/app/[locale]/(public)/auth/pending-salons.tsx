import { PendingSalonsScreen } from "@/features/auth/PendingSalonsScreen";

// Explicit confirm step for salons registered with the signed-in user's email; never indexed.
export default function PendingSalonsRoute() {
  return <PendingSalonsScreen />;
}
