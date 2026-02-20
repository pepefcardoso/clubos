export type MemberStatus = "ACTIVE" | "INACTIVE" | "OVERDUE";

export type ChargeStatus =
  | "PENDING"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "PENDING_RETRY";

export type UserRole = "ADMIN" | "TREASURER";

export type PlanInterval = "monthly" | "quarterly" | "annual";

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
