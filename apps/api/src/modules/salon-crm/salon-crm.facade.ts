// Public surface of the salon-crm module (boundary rule api-modules-use-facades).
export { SalonCrmModule } from "./salon-crm.module";
export { CrmScopes, type CrmScope } from "./application/crm-scope";
// Payroll and fixed costs for the profit view (insights) and the assistant (topic 08).
export { PayrollClock, PayrollData } from "./payroll/payroll-data";
export { computeMonth, freshLines } from "./payroll/payroll-engine";
export { PayrollService } from "./payroll/payroll.service";
export { SalonCostsService } from "./payroll/salon-costs.service";
