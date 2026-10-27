import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Heading plus optional description and a trailing link/button. `id` is for aria-labelledby on
// the surrounding <section>. Use level 2 for page sections, 3 inside a section.
export function SectionHeader({
  id,
  title,
  description,
  level = 2,
  action,
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  level?: 2 | 3;
  action?: { href: string; label: string } | ReactNode;
  className?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const trailing =
    action && typeof action === "object" && "href" in action && "label" in action ? (
      <Link href={action.href} className="text-primary text-sm font-medium underline">
        {action.label}
      </Link>
    ) : (
      action
    );
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div>
        <Heading
          id={id}
          className={level === 2 ? "text-lg font-semibold" : "text-base font-medium"}
        >
          {title}
        </Heading>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
