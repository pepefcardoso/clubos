export type MemberStatus = "ACTIVE" | "INACTIVE" | "OVERDUE";

export type ChargeStatus =
  | "PENDING"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "PENDING_RETRY";

export type UserRole = "ADMIN" | "TREASURER" | "PHYSIO";

export type ScoutRole = "SCOUT";
export type AppRole = UserRole | ScoutRole;

export type PlanInterval = "monthly" | "quarterly" | "annual";

export type CommunicationLogEventType =
  | "SHOWCASE_PUBLISHED"
  | "SHOWCASE_TRANSFERRED"
  | "CONTACT_REQUEST_CREATED"
  | "CONTACT_BLOCKED_MINOR"
  | "CONTACT_BLOCKED_NO_SUBSCRIPTION"
  | "CONTACT_DUPLICATE_BLOCKED"
  | "CONTACT_ACCEPTED"
  | "CONTACT_REJECTED"
  | "CURATION_REPORT_SENT";

export type PaymentMethod =
  | "PIX"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "BOLETO"
  | "CASH"
  | "BANK_TRANSFER";

export interface Member {
  id: string;
  name: string;
  email?: string | undefined;
  phone: string;
  status: MemberStatus;
  joinedAt: Date;
}

export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: PlanInterval;
  benefits: string[];
  isActive: boolean;
}

export interface Charge {
  id: string;
  memberId: string;
  amountCents: number;
  dueDate: Date;
  status: ChargeStatus;
  method: PaymentMethod;
  gatewayName?: string | undefined;
  externalId?: string | undefined;
  gatewayMeta?: Record<string, unknown> | undefined;
}

export interface Payment {
  id: string;
  chargeId: string;
  paidAt: Date;
  method: PaymentMethod;
  amountCents: number;
  gatewayTxid: string;
}

export interface MonthlyChargeStat {
  /** "YYYY-MM" — ISO year-month of the billing window */
  month: string;
  paid: number;
  overdue: number;
  pending: number;
  paidAmountCents: number;
  overdueAmountCents: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

export type ShowcaseTier = "FREE" | "PREMIUM";
export type ContactRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type ScoutSubscriptionStatus = "ACTIVE" | "INACTIVE";

export interface ShowcaseSnapshot {
  athleteId: string;
  clubId: string;
  name: string;
  position: string | null;
  ageYears: number;
  dominantFoot: string | null;
  rtpStatus: string | null;
  acwrTrend: Array<{
    date: string;
    acwrRatio: number | null;
    riskZone: string;
    acuteLoadAu: number;
    chronicLoadAu: number;
  }>;
  evaluationScores: {
    technique: number;
    tactical: number;
    physical: number;
    mental: number;
    attitude: number;
  } | null;
  snapshotBuiltAt: string;
  state?: string | null; // TODO: [T-185] populate once Athlete.state exists
}

export interface ScoutAthleteResult {
  id: string;
  athleteId: string;
  clubId: string;
  tier: ShowcaseTier;
  nameInitials: string;
  position: string | null;
  ageYears: number;
  state: string | null;
  rtpStatus: string | null;
  acwrTrend: ShowcaseSnapshot["acwrTrend"] | null;
  evaluationScores: ShowcaseSnapshot["evaluationScores"] | null;
  videoCount: number | null;
  upgrade_required: boolean;
}

export interface ScoutVideoItem {
  id: string;
  r2Key: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  order: number;
}

export interface ScoutAthleteProfile extends ScoutAthleteResult {
  snapshotHash: string;
  snapshotBuiltAt: string;
  videos: ScoutVideoItem[] | null;
}

export interface CreateContactRequestResponse {
  contactRequestId: string;
  status: "PENDING";
  athleteId: string;
  clubId: string;
}

export interface RespondContactRequestResponse {
  contactRequestId: string;
  status: "ACCEPTED" | "REJECTED";
  athleteId: string;
  clubId: string;
}
