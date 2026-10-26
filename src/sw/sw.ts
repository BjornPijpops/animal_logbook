/// <reference lib="webworker" />
import {
  CacheFirst,
  ExpirationPlugin,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";
import { EMERGENCY_CACHE } from "@/lib/offline/emergency-cache";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EMERGENCY_PAGE = new RegExp(`^/animals/${UUID}/emergency$`, "i");
const FILE_ROUTE = new RegExp(`^/api/files/${UUID}$`, "i");

async function networkThenEmergencyCache(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match(request, { cacheName: EMERGENCY_CACHE, ignoreVary: true });
    if (cached) return cached;
    const offline = await serwist.matchPrecache("/offline");
    if (offline && request.mode === "navigate") return offline;
    throw error;
  }
}

// Only static, non-personal assets are cached. Authenticated pages and API responses are never
// stored by the worker itself. The only exception is the opt-in emergency cache, which the page
// fills while signed in and clears on sign-out; the worker only reads it as an offline fallback.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request, url }) =>
        (request.mode === "navigate" && EMERGENCY_PAGE.test(url.pathname)) ||
        (request.method === "GET" && FILE_ROUTE.test(url.pathname)),
      handler: ({ request }) => networkThenEmergencyCache(request),
    },
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"),
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 })],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
