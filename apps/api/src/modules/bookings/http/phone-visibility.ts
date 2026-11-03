import type { SalonBooking } from "@gugu/contracts";
import { maskPhone } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";

/**
 * CRM booking responses show the client's phone only to members holding `customers.phone.read`
 * (granted to every role by default, revocable by the owner — q24); others get a masked number.
 * The optional email (topic 11) follows the same rule: hidden contact data is hidden entirely.
 */
export function withPhoneVisibility(salon: SalonContext, booking: SalonBooking): SalonBooking {
  if (salon.permissions.has("customers.phone.read") || !booking.customer) return booking;
  return {
    ...booking,
    customer: {
      ...booking.customer,
      phone: booking.customer.phone ? maskPhone(booking.customer.phone) : null,
      email: booking.customer.email ? maskEmail(booking.customer.email) : null,
    },
  };
}

/** `lan.nguyen@example.vn` → `l•••@example.vn`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at <= 0 ? "•••" : `${email.slice(0, 1)}•••${email.slice(at)}`;
}
