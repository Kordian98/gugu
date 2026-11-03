import {
  type BusinessType,
  SETUP_ITEMS,
  SETUP_STEPS,
  type SetupItem,
  type SetupState,
  type SetupStep,
  setupStepSchema,
  businessTypeSchema,
} from "@gugu/contracts";

/** Primary marketplace category per business-type tile (`mixed` = none). */
export const BUSINESS_TYPE_CATEGORY: Record<BusinessType, string | null> = {
  nails: "nails",
  hair: "hair",
  spa: "spa",
  lashes_brows: "lashes",
  mixed: null,
};

export interface SetupFacts {
  businessDone: boolean;
  openingDays: number;
  activeServices: number;
  bookableStaff: number;
  zaloConnected: boolean;
}

/**
 * What is still open, from real data (never from clicks), in wizard order. Never the name: it is the
 * mandatory first step (q103), so the Today card can't offer it.
 */
export function setupRemaining(f: SetupFacts): SetupItem[] {
  const done: Record<SetupItem, boolean> = {
    business: f.businessDone,
    hours: f.openingDays > 0,
    services: f.activeServices > 0,
    team: f.bookableStaff > 0,
    zalo: f.zaloConnected,
  };
  return SETUP_ITEMS.filter((i) => i !== "business" && !done[i]);
}

export interface SetupRow {
  businessType: string | null;
  nameConfirmed: boolean;
  currentStep: string;
  completedSteps: string[];
  skippedSteps: string[];
  wizardClosedAt: Date | null;
  finishedAt: Date | null;
  cardDismissedAt: Date | null;
}

const steps = (xs: string[]): SetupStep[] =>
  xs.filter((x): x is SetupStep => setupStepSchema.safeParse(x).success);

export function setupStateOf(row: SetupRow, facts: SetupFacts): SetupState {
  const type = businessTypeSchema.safeParse(row.businessType);
  const current = setupStepSchema.safeParse(row.currentStep);
  return {
    businessType: type.success ? type.data : null,
    nameConfirmed: row.nameConfirmed,
    currentStep: current.success ? current.data : "business",
    completed: steps(row.completedSteps),
    skipped: steps(row.skippedSteps),
    wizardClosed: row.wizardClosedAt !== null,
    finished: row.finishedAt !== null,
    cardDismissed: row.cardDismissedAt !== null,
    remaining: setupRemaining(facts),
  };
}

export const stepIndex = (step: SetupStep): number => SETUP_STEPS.indexOf(step);

/** Adds `step` to `list` once, keeping wizard order. */
export function withStep(list: string[], step: SetupStep): SetupStep[] {
  const set = new Set([...steps(list), step]);
  return SETUP_STEPS.filter((s) => set.has(s));
}

export const withoutStep = (list: string[], step: SetupStep): SetupStep[] =>
  steps(list).filter((s) => s !== step);
