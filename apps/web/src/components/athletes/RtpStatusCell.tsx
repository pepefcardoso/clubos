"use client";

import { useAthleteRtp } from "@/hooks/use-rtp";
import { RtpStatusBadge, type RtpStatus } from "./RtpStatusBadge";

interface RtpStatusCellProps {
  athleteId: string;
}

function SkeletonPill() {
  return (
    <div
      className="h-5 w-20 rounded-full bg-neutral-200 animate-pulse"
      aria-hidden="true"
    />
  );
}

export function RtpStatusCell({ athleteId }: RtpStatusCellProps) {
  const { data, isLoading } = useAthleteRtp(athleteId);

  if (isLoading) return <SkeletonPill />;

  const status = (data?.status ?? null) as RtpStatus;

  return <RtpStatusBadge status={status} />;
}
