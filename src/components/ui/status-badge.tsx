import { AlertTriangle, CheckCircle2, Clock, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type StatusTone = "info" | "attention" | "caution" | "success";

const tones: Record<StatusTone, { icon: LucideIcon; classes: string }> = {
  info: { icon: Info, classes: "bg-info-soft text-info" },
  attention: { icon: Clock, classes: "bg-attention-soft text-attention" },
  caution: { icon: AlertTriangle, classes: "bg-caution-soft text-caution" },
  success: { icon: CheckCircle2, classes: "bg-success-soft text-success" },
};

// Colour is never the only signal: every badge has a tone icon and a text label.
export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  const { icon: Icon, classes } = tones[tone];
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        classes,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}
