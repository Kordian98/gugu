import { VerifyScreen } from "@/features/auth/VerifyScreen";

// Magic-link landing page (`/{locale}/auth/verify?token=…`); never indexed.
export default function VerifyRoute() {
  return <VerifyScreen />;
}
