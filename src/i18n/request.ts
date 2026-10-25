import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

// No locale in the URL: the locale will come from the user's preference (see ARCHITECTURE.md).
export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return { locale, messages: (await import(`./messages/${locale}.json`)).default };
});
