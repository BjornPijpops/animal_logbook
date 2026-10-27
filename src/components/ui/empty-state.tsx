import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// What a list shows when it has nothing: icon, short message, optional action. Keep the wording
// factual ("No doses left today."), never advice.
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-2", className)}>
      {Icon ? (
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
      <div>
        <p className="font-medium">{title}</p>
        {children ? <p className="text-muted-foreground text-sm">{children}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}
