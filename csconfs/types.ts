export interface ConferenceRecord {
  name: string;
  year: number;
  venueKeys: string[];
  description?: string | null;
  link?: string | null;
  seriesLink?: string | null;
  date?: string | null;
  place?: string | null;
  abstractDeadline?: string | null;
  deadline?: string | null;
  rebuttalDate?: string | null;
  notificationDate?: string | null;
  note?: string | null;
  generalChair?: string | null;
  programChair?: string | null;
  acceptanceRate?: number | null;
  submissions?: number | null;
  estimated?: boolean;
  verified?: boolean;
}

export type ConferenceGroup = ConferenceRecord[];

