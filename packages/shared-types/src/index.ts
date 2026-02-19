export type MemberStatus = "ACTIVE" | "INACTIVE" | "OVERDUE";
export type ChargeStatus =
  | "PENDING"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "PENDING_RETRY";
export type UserRole = "ADMIN" | "TREASURER";
export type PlanInterval = "monthly" | "quarterly" | "annual";

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: MemberStatus;
  joinedAt: Date;
}

export interface Charge {
  id: string;
  memberId: string;
  amountCents: number;
  dueDate: Date;
  status: ChargeStatus;
  pixCobId?: string;
}
