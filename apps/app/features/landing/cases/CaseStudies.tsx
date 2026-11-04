import { Businesses } from "../Businesses";

/**
 * Native: the business tiles (the illustrated case studies are web DOM + CSS; CaseStudies.web.tsx).
 * Same props as the web component.
 */
export function CaseStudies({ desktop }: { reduce: boolean; desktop: boolean }) {
  return <Businesses columns={desktop ? 3 : 2} />;
}
