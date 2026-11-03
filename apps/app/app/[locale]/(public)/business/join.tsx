import { SignInScreen } from "@/features/auth/SignInScreen";

// Email-only signup (owner 2026-11-04): one field, then the guided setup inside the workspace.
export default function BusinessJoinRoute() {
  return <SignInScreen mode="signUp" />;
}
