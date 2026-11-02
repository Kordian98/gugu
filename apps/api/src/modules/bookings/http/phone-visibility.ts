import type { SalonBooking } from "@gugu/contracts";
import { maskPhone } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";

/**
 * CRM booking responses show the client's phone only to members holding `customers.phone.read`
 * (granted to every role by default, revocable by the owner — q24); others get a masked number.
 */
export function withPhoneVisibility(salon: SalonContext, booking: SalonBooking): SalonBooking {
  if (salon.permissions.has("customers.phone.read") || !booking.customer?.phone) return booking;
  return {
    ...booking,
    customer: { ...booking.customer, phone: maskPhone(booking.customer.phone) },
  };
}
