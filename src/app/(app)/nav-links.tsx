"use client";

import {
  CalendarClock,
  FileText,
  Utensils,
  Wallet,
  Home,
  MoreHorizontal,
  PawPrint,
  Pill,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const primary = [
  { href: "/", key: "home", icon: Home },
  { href: "/animals", key: "animals", icon: PawPrint },
  { href: "/timeline", key: "timeline", icon: CalendarClock },
] as const;

const more = [
  { href: "/medications", key: "medications", icon: Pill },
  { href: "/expenses", key: "expenses", icon: Wallet },
  { href: "/food", key: "food", icon: Utensils },
  { href: "/documents", key: "documents", icon: FileText },
  { href: "/household", key: "household", icon: Users },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

const isCurrent = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

const itemClass = (current: boolean) =>
  cn(
    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-none",
    current ? "bg-primary text-primary-foreground hover:bg-primary" : "hover:bg-muted",
  );

type Item = (typeof primary)[number] | (typeof more)[number];

function NavItem({
  item,
  pathname,
  vertical,
}: {
  item: Item;
  pathname: string;
  vertical: boolean;
}) {
  const t = useTranslations("nav");
  const current = isCurrent(pathname, item.href);
  const Icon = item.icon;
  return (
    <li className={vertical ? undefined : "flex-1"}>
      <Link
        href={item.href}
        aria-current={current ? "page" : undefined}
        className={cn(
          itemClass(current),
          !vertical && "flex-col justify-center gap-0.5 px-1 text-xs",
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
        {t(item.key)}
      </Link>
    </li>
  );
}

export function NavLinks() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-col gap-1">
        {[...primary, ...more].map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} vertical />
        ))}
      </ul>
    </nav>
  );
}

export function MobileNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  // The menu closes by itself whenever the route changes.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const moreCurrent = more.some((item) => isCurrent(pathname, item.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenFor(null);
      buttonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpenFor(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <nav
          id="more-menu"
          aria-label={t("moreLabel")}
          className="border-border bg-card absolute inset-x-0 bottom-full border-t p-2 shadow-lg"
        >
          <ul className="grid grid-cols-2 gap-1">
            {more.map((item) => (
              <NavItem key={item.href} item={item} pathname={pathname} vertical />
            ))}
          </ul>
        </nav>
      ) : null}
      <nav aria-label={t("label")}>
        <ul className="flex justify-around gap-1 p-1">
          {primary.map((item) => (
            <NavItem key={item.href} item={item} pathname={pathname} vertical={false} />
          ))}
          <li className="flex-1">
            <button
              ref={buttonRef}
              type="button"
              aria-expanded={open}
              aria-controls="more-menu"
              aria-current={moreCurrent ? "page" : undefined}
              onClick={() => setOpenFor(open ? null : pathname)}
              className={cn(
                itemClass(moreCurrent),
                "w-full flex-col justify-center gap-0.5 px-1 text-xs",
              )}
            >
              <MoreHorizontal aria-hidden="true" className="size-5" />
              {t("more")}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
