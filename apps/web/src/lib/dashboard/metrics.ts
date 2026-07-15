export type MetricTrend = {
  direction: "up" | "down" | "flat";
  sentiment: "positive" | "negative" | "neutral";
  value: string;
  label: string;
};

type AppointmentForStats = {
  patient_id: string;
  status: string;
};

export function buildAppointmentStats(appointments: AppointmentForStats[]) {
  const attended = appointments.filter(
    (appointment) => appointment.status === "attended",
  ).length;
  const noShows = appointments.filter(
    (appointment) => appointment.status === "no_show",
  ).length;
  const cancellations = appointments.filter(
    (appointment) => appointment.status === "cancelled",
  ).length;
  const completed = attended + noShows;

  return {
    total: appointments.length,
    valid: appointments.length - cancellations - noShows,
    attended,
    uniquePatients: new Set(
      appointments.map((appointment) => appointment.patient_id),
    ).size,
    noShowRate: nullablePercentage(noShows, completed),
    cancellationRate: nullablePercentage(cancellations, appointments.length),
  };
}

export function buildCountTrend(
  current: number,
  comparison: number,
  preferred: "higher" | "lower" = "higher",
): MetricTrend {
  if (current === comparison) {
    return neutralTrend("0%");
  }

  const direction = current > comparison ? "up" : "down";
  const sentiment = trendSentiment(direction, preferred);

  if (comparison === 0) {
    return {
      direction,
      sentiment,
      value: current > 0 ? "Novo" : "0%",
      label: "vs. comparação",
    };
  }

  const delta = Math.round(((current - comparison) / comparison) * 100);
  return {
    direction,
    sentiment,
    value: `${delta > 0 ? "+" : ""}${delta}%`,
    label: "vs. comparação",
  };
}

export function buildRateTrend(
  current: number,
  comparison: number,
  preferred: "higher" | "lower",
): MetricTrend {
  const delta = current - comparison;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return {
    direction,
    sentiment:
      direction === "flat" ? "neutral" : trendSentiment(direction, preferred),
    value: `${delta > 0 ? "+" : ""}${delta} p.p.`,
    label: "vs. comparação",
  };
}

function nullablePercentage(value: number, total: number) {
  if (!total) return null;
  return Math.round((value / total) * 100);
}

function trendSentiment(
  direction: "up" | "down",
  preferred: "higher" | "lower",
) {
  return (direction === "up" && preferred === "higher") ||
    (direction === "down" && preferred === "lower")
    ? ("positive" as const)
    : ("negative" as const);
}

function neutralTrend(value: string): MetricTrend {
  return {
    direction: "flat",
    sentiment: "neutral",
    value,
    label: "vs. comparação",
  };
}
