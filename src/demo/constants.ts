// Fixed identifiers make the demo easy to find, reset and keep isolated: only these rows are
// ever touched by `--reset`. The addresses use the reserved example.test domain, and the
// delivery guard (src/lib/notify/demo-guard.ts) blocks every email and push to them.
export const DEMO_PASSWORD = "DemoPassword-2024!";
export const DEMO_TIMEZONE = "Europe/Brussels";
export const DEMO_HOUSEHOLD_NAME = "Demo household";

export const DEMO_IDS = {
  owner: "00000000-0000-4000-8000-00000000d001",
  viewer: "00000000-0000-4000-8000-00000000d002",
  household: "00000000-0000-4000-8000-00000000d0a0",
} as const;

export const DEMO_OWNER = {
  id: DEMO_IDS.owner,
  name: "Demo Owner",
  email: "demo-owner@example.test",
  phone: "+32 470 00 00 00",
} as const;

export const DEMO_VIEWER = {
  id: DEMO_IDS.viewer,
  name: "Demo Viewer",
  email: "demo-viewer@example.test",
  phone: null,
} as const;
