import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Page layout shell: title, optional description and actions, then the content. `width="wide"`
// widens the app's content column (the app layout reacts to data-page-width); the default keeps
// the narrow reading column. Content below the header is arranged with PageGrid.
export function PageShell({
  title,
  description,
  actions,
  width = "narrow",
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  width?: "narrow" | "wide";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-page-width={width} className={cn("space-y-section @container", className)}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

// 12-column grid on wide containers (container query, so it also adapts inside narrow pages),
// one column otherwise. Columns are not stretched to equal height.
export function PageGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("gap-section grid grid-cols-1 items-start @4xl:grid-cols-12", className)}
      {...props}
    />
  );
}

export function MainColumn({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-section @4xl:col-span-8", className)} {...props} />;
}

export function SideColumn({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-section @4xl:col-span-4", className)} {...props} />;
}
