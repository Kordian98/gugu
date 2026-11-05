/** Form preview only: no time is reserved until the booking API accepts the save. */
export type AppointmentDraft = {
  date: string;
  saving: boolean;
  blocks: {
    staffId: string;
    startsAt: string;
    endsAt: string;
    service: string;
  }[];
};
