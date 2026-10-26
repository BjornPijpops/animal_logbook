"use client";

import {
  CalendarClock,
  FileText,
  Wallet,
  Home,
  PawPrint,
  Pill,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const items = [
  { href: "/", key: "home", icon: Home },
  { href: "/animals", key: "animals", icon: PawPrint },
  { href: "/timeline", key: "timeline", icon: CalendarClock },
  { href: "/medications", key: "medications", icon: Pill },
  { href: "/expenses", key: "expenses", icon: Wallet },
  { href: "/documents", key: "documents", icon: FileText },
  { href: "/household", key: "household", icon: Users },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

export function NavLinks({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")}>
      <ul
        className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "justify-around p-1")}
      >
        {items.map(({ href, key, icon: Icon }) => {
          const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className={orientation === "horizontal" ? "flex-1" : undefined}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                  orientation === "horizontal" && "flex-col justify-center gap-0.5 px-1 text-xs",
                  current ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
