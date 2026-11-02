import { ShellScreen } from "@/features/shell/ShellScreen";

// Route-group shell screen; replaced by the owning topic's real screens.
export default function AdminHome() {
  return <ShellScreen area="admin" />;
}
