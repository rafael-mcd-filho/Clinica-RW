import { cn } from "@/lib/utils";

export function PatientCompletenessRing({
  children,
  className,
  deceased = false,
  missing = [],
  percentage,
}: {
  children: React.ReactNode;
  className?: string;
  deceased?: boolean;
  missing?: string[];
  percentage: number;
}) {
  const safePercentage = Math.max(0, Math.min(100, percentage));
  const displayedPercentage = deceased ? 100 : safePercentage;
  const color = deceased
    ? "var(--destructive)"
    : safePercentage === 100
      ? "var(--success)"
      : safePercentage >= 63
        ? "var(--primary)"
        : "var(--warning)";
  const label = deceased
    ? "Paciente falecido"
    : safePercentage === 100
      ? "Cadastro completo"
      : `Cadastro ${safePercentage}% completo${
          missing.length ? `. Falta: ${missing.join(", ")}` : ""
        }`;

  return (
    <span
      className={cn("inline-flex shrink-0 rounded-full p-[3px]", className)}
      style={{
        background: `conic-gradient(${color} ${displayedPercentage}%, var(--border) ${displayedPercentage}% 100%)`,
      }}
      title={label}
      aria-label={label}
    >
      <span className="inline-flex rounded-full bg-card p-0.5">{children}</span>
    </span>
  );
}
