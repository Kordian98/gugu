import { BOOKING_ERRORS } from "@gugu/contracts";
import { normalizeVnPhone } from "@gugu/domain";
import { AppError } from "../../../common/problem/app-error";

/** Vietnamese phone → E.164, or 422 `booking.phone_invalid` on `customer.phone`. */
export function normalizedPhone(input: string): string {
  const e164 = normalizeVnPhone(input);
  if (!e164) {
    throw new AppError(422, BOOKING_ERRORS.phoneInvalid, "Invalid phone number", {
      errors: [{ path: "customer.phone", code: BOOKING_ERRORS.phoneInvalid }],
    });
  }
  return e164;
}
