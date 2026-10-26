import { z } from "zod";

export const EMERGENCY_CACHE = "emergency-v1";
const FLAG_KEY = "animal-logbook:offline-emergency";

const manifestSchema = z.object({ urls: z.array(z.string().startsWith("/")) });

export function isOfflineEmergencyEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

// Copies the emergency pages and primary photos into the Cache API using the signed-in session.
// Called only from authenticated pages, so nothing is stored for signed-out visitors.
export async function syncOfflineEmergency(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const response = await fetch("/api/emergency-manifest", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return false;
  const { urls } = manifestSchema.parse(await response.json());

  const cache = await caches.open(EMERGENCY_CACHE);
  const wanted = new Set(urls.map((url) => new URL(url, location.origin).href));
  for (const request of await cache.keys()) {
    if (!wanted.has(request.url)) await cache.delete(request);
  }
  for (const url of urls) {
    const page = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (page.ok && !page.redirected) await cache.put(url, page);
  }
  return true;
}

export async function enableOfflineEmergency(): Promise<boolean> {
  const synced = await syncOfflineEmergency();
  if (synced) localStorage.setItem(FLAG_KEY, "1");
  return synced;
}

export async function clearOfflineEmergency(): Promise<void> {
  try {
    localStorage.removeItem(FLAG_KEY);
  } catch {
    // Storage may be unavailable; the cache is still removed below.
  }
  if (typeof caches !== "undefined") await caches.delete(EMERGENCY_CACHE);
}
