import { PawPrint } from "lucide-react";
import { cn } from "@/lib/cn";

const sizes = { sm: "size-10", md: "size-14", lg: "size-20" } as const;

// A photo from the authenticated file route, or a paw illustration when there is none.
// The image is decorative: put the name next to it.
export function Avatar({
  src,
  fallbackLabel,
  size = "md",
  className,
}: {
  src?: string | null;
  fallbackLabel: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const box = cn("shrink-0 rounded-full object-cover", sizes[size], className);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin image
    return <img src={src} alt="" className={box} />;
  }
  return (
    <span className={cn(box, "bg-accent-soft text-primary flex items-center justify-center")}>
      <PawPrint aria-hidden="true" className="size-1/2" />
      <span className="sr-only">{fallbackLabel}</span>
    </span>
  );
}
