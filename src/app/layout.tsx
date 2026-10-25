import "@fontsource-variable/inter";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

// Dynamic on purpose: the per-request CSP nonce (see proxy.ts) must be applied to every page.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  const p = await getTranslations("pwa");
  return {
    title: { default: t("appName"), template: `%s · ${t("appName")}` },
    description: p("description"),
    applicationName: t("appName"),
    appleWebApp: { capable: true, title: t("appName"), statusBarStyle: "default" },
  };
}

export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, messages, t] = await Promise.all([
    getLocale(),
    getMessages(),
    getTranslations("common"),
  ]);
  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="bg-card sr-only rounded-lg p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
