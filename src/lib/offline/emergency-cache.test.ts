import { afterEach, expect, it, vi } from "vitest";
import { EMERGENCY_CACHE, syncOfflineEmergency } from "./emergency-cache";

afterEach(() => vi.unstubAllGlobals());

it("clears the offline cache when the manifest answers 401", async () => {
  const deleted: string[] = [];
  vi.stubGlobal("caches", { delete: async (name: string) => deleted.push(name) });
  vi.stubGlobal("fetch", async () => new Response(null, { status: 401 }));
  localStorage.setItem("animal-logbook:offline-emergency", "1");

  expect(await syncOfflineEmergency()).toBe(false);
  expect(deleted).toEqual([EMERGENCY_CACHE]);
  expect(localStorage.getItem("animal-logbook:offline-emergency")).toBeNull();
});
