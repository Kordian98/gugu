import { LandingScreen } from "@/features/landing/LandingScreen";

// X19: the homepage is the SaaS landing for salon owners. The consumer marketplace home lives
// (unrouted) in features/marketplace-home until the marketplace launches.
export default function Home() {
  return <LandingScreen />;
}
