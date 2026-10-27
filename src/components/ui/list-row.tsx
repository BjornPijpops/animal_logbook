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

// A two-line row: icon, title (a link when `href` is set), muted subtitle, trailing meta and
// an optional actions slot. Render inside <ul>/<ol> (it outputs an <li>).
export function ListRow({
  icon: Icon,
  tone = "neutral",
  title,
  href,
  subtitle,
  meta,
  actions,
  className,
}: {
  icon?: LucideIcon;
  tone?: StatusTone | "neutral";
  title: ReactNode;
  href?: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 py-3", className)}>
      {Icon ? (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            iconTones[tone],
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate font-medium">
          {href ? (
            <Link href={href} className="hover:underline focus-visible:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </p>
        {subtitle ? <p className="text-muted-foreground truncate text-sm">{subtitle}</p> : null}
      </div>
      {meta ? <div className="text-muted-foreground shrink-0 text-sm">{meta}</div> : null}
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </li>
  );
}
