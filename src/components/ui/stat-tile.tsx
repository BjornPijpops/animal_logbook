import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { StatusTone } from "./status-badge";

const iconTones: Record<StatusTone | "neutral", string> = {
  neutral: "bg-accent-soft text-primary",
  info: "bg-info-soft text-info",
  attention: "bg-attention-soft text-attention",
  caution: "bg-caution-soft text-caution",
  success: "bg-success-soft text-success",
};

// A number with a label. With `href` the whole tile is one link, so the accessible name reads
// "label value hint". The value is text, never only colour.
export function StatTile({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  icon?: LucideIcon;
  tone?: StatusTone | "neutral";
  className?: string;
}) {
  const classes = cn(
    "bg-card shadow-card rounded-tile flex min-h-11 items-start gap-3 p-4",
    href ? "hover:shadow-raised transition-shadow" : "",
    className,
  );
  const body = (
    <>
      {Icon ? (
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            iconTones[tone],
          )}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="text-muted-foreground block text-sm">{label}</span>{" "}
        <span className="block text-2xl leading-tight font-semibold">{value}</span>{" "}
        {hint ? <span className="text-muted-foreground block text-xs">{hint}</span> : null}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
