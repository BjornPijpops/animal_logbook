import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// "outline" is the original bordered card that older pages still use. "raised" is the design-system
// surface (shadow, large radius, no border, padding supplied by the slots). See docs/DESIGN.md.
const cardVariants = cva("bg-card", {
  variants: {
    variant: {
      outline: "border-border rounded-xl border p-5 shadow-sm",
      raised: "shadow-card rounded-card",
    },
  },
  defaultVariants: { variant: "outline" },
});

type CardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>;

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-card pt-card", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-card py-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-line px-card border-t py-3 text-sm", className)} {...props} />;
}
