import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type AlertProps = { tone: "error" | "success"; children: ReactNode; className?: string };

// Icon plus text, so the state never relies on color alone.
export function Alert({ tone, children, className }: AlertProps) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-sm",
        tone === "error" ? "border-destructive text-destructive" : "border-success text-success",
        "bg-card",
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
