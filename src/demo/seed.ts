import { hashPassword } from "better-auth/crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { scopeDb } from "@/db/scope";
import {
  accounts,
  animals,
  documents,
  files,
  householdMembers,
  households,
  users,
} from "@/db/schema";
import { addPhoto, addWeight, createAnimal } from "@/features/animals/server/service";
import { createAppointment, deleteAppointment } from "@/features/appointments/server/service";
import { createDocument } from "@/features/documents/server/service";
import { createExpense } from "@/features/expenses/server/service";
import { addAttachment } from "@/features/files/server/attachments.service";
import { createFoodPlan, logPurchase } from "@/features/food/server/service";
import { resolveCtx } from "@/features/households/server/context";
import {
  acceptInvite,
  changeMemberRole,
  inviteMember,
  type HouseholdDeps,
} from "@/features/households/server/service";
import { createMedicalRecord } from "@/features/medical/server/service";
import { createMedication, logDose } from "@/features/medications/server/service";
import { generateDoseReminders, markMissedDoses } from "@/features/medications/worker";
import type { Result } from "@/lib/result";
import type { StorageAdapter } from "@/lib/storage/types";
import { NoopScanner } from "@/lib/uploads/virus-scanner";
import { demoPdf, demoPortrait, LUNA_PALETTE } from "./assets";
import {
  DEMO_HOUSEHOLD_NAME,
  DEMO_IDS,
  DEMO_OWNER,
  DEMO_PASSWORD,
  DEMO_TIMEZONE,
  DEMO_VIEWER,
} from "./constants";
import { createDemoDates, type DemoDates } from "./dates";

export type DemoSeedDeps = {
  // Owner-role handle (fixtures, reset). Scoped service calls still run as the restricted roles.
  db: Database;
  storage: StorageAdapter;
  now?: Date;
  log?: (message: string) => void;
};

export type DemoSeedResult = {
  created: boolean;
  householdId: string;
  lunaId: string | null;
  miloId: string | null;
};

function must<T>(result: Result<T>, what: string): T {
  if (!result.ok) throw new Error(`Demo seed failed at ${what}: ${result.error.message}`);
  return result.value;
}

const SLOT_TIMES = { daily: ["08:00", "20:00"], course: ["09:00", "21:00"] } as const;

export async function removeDemo(deps: Pick<DemoSeedDeps, "db" | "storage">): Promise<void> {
  const { db, storage } = deps;
  const stored = await inDemoHousehold(db)
    .select({ key: files.storageKey })
    .from(files)
    .where(eq(files.householdId, DEMO_IDS.household));
  for (const { key } of stored) await storage.delete(key);
  await db.delete(households).where(eq(households.id, DEMO_IDS.household));
  await db.delete(users).where(inArray(users.id, [DEMO_IDS.owner, DEMO_IDS.viewer]));
}

// The seed ends with the documents, so their presence means every earlier step finished.
// Household-scoped tables are read as the demo owner, so row-level security applies as in the app.
const inDemoHousehold = (db: Database) =>
  scopeDb(db, { userId: DEMO_IDS.owner, householdId: DEMO_IDS.household });

async function isComplete(db: Database): Promise<boolean> {
  const [row] = await inDemoHousehold(db)
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.householdId, DEMO_IDS.household));
  return (row?.count ?? 0) >= 5;
}

export async function seedDemo(
  deps: DemoSeedDeps,
  options: { reset?: boolean } = {},
): Promise<DemoSeedResult> {
  const { db, storage } = deps;
  const log = deps.log ?? (() => undefined);
  const exists = (await db.select({ id: users.id }).from(users).where(eq(users.id, DEMO_IDS.owner)))
    .length;

  if (exists > 0 && !options.reset && (await isComplete(db))) {
    const found = await inDemoHousehold(db)
      .select({ id: animals.id, name: animals.name })
      .from(animals)
      .where(eq(animals.householdId, DEMO_IDS.household));
    log("Demo household already exists; nothing changed (use --reset to recreate it).");
    return {
      created: false,
      householdId: DEMO_IDS.household,
      lunaId: found.find((a) => a.name === "Luna")?.id ?? null,
      miloId: found.find((a) => a.name === "Milo")?.id ?? null,
    };
  }
  // A reset, or a run that stopped halfway earlier, starts from a clean slate.
  await removeDemo({ db, storage });

  const now = deps.now ?? new Date();
  const d = createDemoDates(now, DEMO_TIMEZONE);

  await createAccounts(db);
  const ownerCtx = must(
    await resolveCtx(db, { id: DEMO_OWNER.id, name: DEMO_OWNER.name }, DEMO_IDS.household),
    "owner context",
  );
  const sent: string[] = [];
  const householdDeps: HouseholdDeps = {
    db,
    appUrl: "http://localhost:3000",
    mailer: {
      // Invitations are captured, never sent: the token is read from the text below.
      async send(message) {
        sent.push(message.text);
      },
    },
    limiter: { consume: async () => ({ allowed: true, remaining: 100 }) },
    now: () => now,
  };
  await inviteViewer(householdDeps, ownerCtx, sent);
  log("Household, owner and viewer ready.");

  const uploads = {
    db,
    storage,
    scanner: new NoopScanner(),
    maxUploadBytes: 5 * 1024 * 1024,
    householdQuotaBytes: 200 * 1024 * 1024,
  };
  const animalDeps = { db, storage, maxUploadBytes: uploads.maxUploadBytes, now: () => now };
  const ctx = ownerCtx;

  const lunaId = await seedAnimals(animalDeps, ctx, d, log);
  const miloId = await seedMilo(animalDeps, ctx, d);
  const dhppId = await seedMedical(db, ctx, d, lunaId);
  const medications = await seedMedications(db, ctx, d, lunaId, log);
  await seedAppointments(db, uploads, ctx, d, lunaId, dhppId, log);
  await seedFood(db, ctx, d, lunaId);
  await seedExpenses(db, uploads, ctx, d, lunaId, medications);
  await generateDoseReminders(db, { now, staleWindowHours: 24 });
  await seedDocuments(uploads, ctx, d, lunaId);
  log("Demo data created.");
  return { created: true, householdId: DEMO_IDS.household, lunaId, miloId };
}

async function createAccounts(db: Database): Promise<void> {
  const password = await hashPassword(DEMO_PASSWORD);
  await db.transaction(async (tx) => {
    for (const person of [DEMO_OWNER, DEMO_VIEWER]) {
      await tx.insert(users).values({
        id: person.id,
        name: person.name,
        email: person.email,
        emailVerified: true,
        phone: person.phone,
      });
      await tx.insert(accounts).values({
        userId: person.id,
        accountId: person.id,
        providerId: "credential",
        password,
      });
    }
    await tx.insert(households).values({
      id: DEMO_IDS.household,
      name: DEMO_HOUSEHOLD_NAME,
      timezone: DEMO_TIMEZONE,
      createdBy: DEMO_IDS.owner,
    });
    await tx
      .insert(householdMembers)
      .values({ householdId: DEMO_IDS.household, userId: DEMO_IDS.owner, role: "owner" });
  });
}

// Invite, accept and role change all go through the real service, so the audit log holds the
// same entries a household would have produced by hand.
async function inviteViewer(
  deps: HouseholdDeps,
  ctx: Parameters<typeof inviteMember>[1],
  sent: string[],
): Promise<void> {
  must(await inviteMember(deps, ctx, { email: DEMO_VIEWER.email, role: "editor" }), "invite");
  const token = /\/invite\/([A-Za-z0-9_-]+)/.exec(sent.at(-1) ?? "")?.[1];
  if (!token) throw new Error("Demo seed could not read the invitation token");
  must(
    await acceptInvite(
      deps,
      { id: DEMO_VIEWER.id, email: DEMO_VIEWER.email, emailVerified: true },
      token,
    ),
    "accept invite",
  );
  must(await changeMemberRole(deps, ctx, DEMO_VIEWER.id, "viewer"), "set viewer role");
}

type Ctx = Parameters<typeof inviteMember>[1];
type AnimalDeps = Parameters<typeof createAnimal>[0];

async function seedAnimals(
  deps: AnimalDeps,
  ctx: Ctx,
  d: DemoDates,
  log: (m: string) => void,
): Promise<string> {
  const luna = must(
    await createAnimal(deps, ctx, {
      name: "Luna",
      species: "dog",
      speciesOther: "",
      breed: "Labrador mix",
      gender: "female",
      birthDate: d.months(-50),
      birthDateIsEstimate: false,
      colorMarkings: "Black with a white chest patch",
      chipNumber: "981000000000042",
      registrationNumber: "DEMO-LB-0042",
      sterilized: "yes",
      emergencyNotes:
        "Friendly but nervous at the vet. Keep calm and offer water. Owner reachable on the number on this card. Demo data: fictional.",
    }),
    "create Luna",
  );
  must(await addPhoto(deps, ctx, luna.id, await demoPortrait(LUNA_PALETTE, "front")), "photo 1");
  must(await addPhoto(deps, ctx, luna.id, await demoPortrait(LUNA_PALETTE, "side")), "photo 2");

  // Eighteen monthly weights: a gentle rise, then a small dip, ending at 28 kg.
  const weights = [
    25.2, 25.6, 26.0, 26.3, 26.7, 27.0, 27.3, 27.6, 27.9, 28.2, 28.5, 28.8, 29.0, 28.9, 28.6, 28.3,
    28.1, 28.0,
  ];
  for (const [index, weight] of weights.entries()) {
    must(
      await addWeight(deps, ctx, luna.id, {
        weight,
        unit: "kg",
        measuredOn: d.months(index - (weights.length - 1)),
        note: index === 0 ? "First weigh-in on the clinic scale" : "",
      }),
      "weight",
    );
  }
  log("Luna profile, photos and weights done.");
  return luna.id;
}

async function seedMilo(deps: AnimalDeps, ctx: Ctx, d: DemoDates): Promise<string> {
  const milo = must(
    await createAnimal(deps, ctx, {
      name: "Milo",
      species: "cat",
      speciesOther: "",
      breed: "Domestic shorthair",
      gender: "male",
      birthDate: d.months(-30),
      birthDateIsEstimate: true,
      colorMarkings: "Ginger tabby",
      chipNumber: "",
      registrationNumber: "",
      sterilized: "yes",
      emergencyNotes: "",
    }),
    "create Milo",
  );
  const entries: [number, number][] = [
    [-90, 4.1],
    [-45, 4.3],
    [-7, 4.4],
  ];
  for (const [offset, weight] of entries) {
    must(
      await addWeight(deps, ctx, milo.id, {
        weight,
        unit: "kg",
        measuredOn: d.days(offset),
        note: "",
      }),
      "Milo weight",
    );
  }
  return milo.id;
}

async function seedMedical(
  db: Database,
  ctx: Ctx,
  d: DemoDates,
  animalId: string,
): Promise<string> {
  const record = async (input: {
    type: "vaccination" | "surgery" | "illness" | "injury" | "allergy";
    title: string;
    startedOn: string;
    endedOn?: string;
    severity?: "mild" | "moderate" | "severe";
    nextDueOn?: string;
    notes: string;
  }) =>
    must(
      await createMedicalRecord({ db }, ctx, {
        animalId,
        endedOn: "",
        severity: "",
        nextDueOn: "",
        ...input,
      }),
      `record ${input.title}`,
    ).id;

  await record({
    type: "vaccination",
    title: "Rabies booster",
    startedOn: d.days(-370),
    nextDueOn: d.days(-5),
    notes: "Next-due date entered by the owner has passed.",
  });
  // The vaccination visit adopts this record later, so its id is returned.
  const dhpp = await record({
    type: "vaccination",
    title: "DHPP booster",
    startedOn: d.days(-323),
    nextDueOn: d.days(42),
    notes: "Booster due again in about six weeks.",
  });
  await record({
    type: "surgery",
    title: "Sterilization (spay)",
    startedOn: d.months(-40),
    notes: "Routine procedure, recovered without complications.",
  });
  await record({
    type: "illness",
    title: "Skin irritation",
    startedOn: d.days(-75),
    severity: "moderate",
    notes:
      "Itching and redness along the belly. Ongoing; the owner keeps notes for the next visit.",
  });
  await record({
    type: "injury",
    title: "Sprained front paw",
    startedOn: d.months(-8),
    endedOn: d.days(-225),
    severity: "mild",
    notes: "Rested for two weeks. Healed.",
  });
  await record({
    type: "allergy",
    title: "Chicken",
    startedOn: d.days(-60),
    severity: "moderate",
    notes: "Entered after the vet visit. Avoid chicken-based food and treats.",
  });
  await record({
    type: "allergy",
    title: "Pollen",
    startedOn: d.months(-36),
    severity: "mild",
    notes: "Seasonal, mostly in spring.",
  });
  return dhpp;
}

type Medications = { daily: string; course: string; asNeeded: string };

async function seedMedications(
  db: Database,
  ctx: Ctx,
  d: DemoDates,
  animalId: string,
  log: (m: string) => void,
): Promise<Medications> {
  const input = (value: {
    name: string;
    dosage: string;
    startedOn: string;
    endedOn?: string;
    kind: "daily" | "as_needed";
    times: string[];
    notes: string;
  }) => ({ animalId, endedOn: "", weekdays: [], intervalDays: null, ...value });
  // Services read their clock from the deps, so a medication can be created "in the past" and
  // its schedule starts counting from then, exactly as if it had been entered back then.
  const at = (date: string, time: string) => ({
    db,
    staleWindowHours: 24,
    missedAfterHours: 4,
    now: () => d.at(date, time),
  });

  const daily = must(
    await createMedication(
      at(d.days(-31), "12:00"),
      ctx,
      input({
        name: "Skin soothing tablets",
        dosage: "1 tablet",
        startedOn: d.days(-70),
        kind: "daily",
        times: [...SLOT_TIMES.daily],
        notes: "Given with food, morning and evening.",
      }),
    ),
    "daily medication",
  ).id;
  const course = must(
    await createMedication(
      at(d.days(-9), "08:00"),
      ctx,
      input({
        name: "Ear drops",
        dosage: "3 drops, left ear",
        startedOn: d.days(-9),
        endedOn: d.days(5),
        kind: "daily",
        times: [...SLOT_TIMES.course],
        notes: "Fourteen-day course.",
      }),
    ),
    "course medication",
  ).id;
  const asNeeded = must(
    await createMedication(
      at(d.days(-120), "09:00"),
      ctx,
      input({
        name: "Joint comfort chew",
        dosage: "1 chew",
        startedOn: d.days(-120),
        kind: "as_needed",
        times: [],
        notes: "After long walks, when stiff.",
      }),
    ),
    "as-needed medication",
  ).id;

  // Dose history: mostly given, a few skipped, a few never logged (those become "missed").
  const history = async (id: string, slots: readonly string[], from: number) => {
    let index = 0;
    for (let offset = from; offset <= -1; offset++) {
      for (const time of slots) {
        index += 1;
        const date = d.days(offset);
        const scheduled = d.at(date, time);
        const missed = index % 23 === 11 || (offset === -3 && time === slots[slots.length - 1]);
        if (missed) continue;
        const skipped = index % 17 === 5;
        const logged = new Date(scheduled.getTime() + 20 * 60_000);
        must(
          await logDose(
            { db, staleWindowHours: 24, missedAfterHours: 4, now: () => logged },
            ctx,
            id,
            {
              scheduledAt: scheduled.toISOString(),
              status: skipped ? "skipped" : "given",
              ...(skipped ? { note: "Refused the tablet, tried again later" } : {}),
            },
          ),
          "dose",
        );
      }
    }
  };
  await history(daily, SLOT_TIMES.daily, -30);
  await history(course, SLOT_TIMES.course, -9);
  for (const offset of [-25, -12, -4]) {
    must(
      await logDose(at(d.days(offset), "10:15"), ctx, asNeeded, {
        status: "given",
        note: "After a long walk",
      }),
      "as-needed dose",
    );
  }

  // The normal job turns unlogged past slots into "missed" rows. It runs once per simulated
  // night, and stops before today so the doses due today stay open.
  for (let offset = -29; offset <= 0; offset++) {
    const simulated = d.at(d.days(offset), "00:30");
    await markMissedDoses(db, {
      now: simulated.getTime() > d.now.getTime() ? d.now : simulated,
      missedAfterHours: 4,
    });
  }
  log("Medications and 30 days of dose history done.");
  return { daily, course, asNeeded };
}

async function seedAppointments(
  db: Database,
  uploads: Parameters<typeof addAttachment>[0],
  ctx: Ctx,
  d: DemoDates,
  animalId: string,
  vaccinationId: string,
  log: (m: string) => void,
): Promise<void> {
  const base = {
    animalId,
    time: "10:00",
    cost: "",
    currency: "EUR",
    notes: "",
    followUpDate: "",
    vaccinationRecord: "",
  };
  const make = async (
    type: "vet" | "grooming" | "training" | "vaccination" | "medication",
    title: string,
    date: string,
    extra: Partial<typeof base> = {},
  ) =>
    must(await createAppointment({ db }, ctx, { ...base, type, title, date, ...extra }), title).id;

  await make("vaccination", "Annual vaccination visit", d.days(-323), {
    cost: "45.00",
    notes: "Booster given. Clinic booklet stamped.",
    vaccinationRecord: vaccinationId,
  });
  await make("grooming", "Full groom", d.days(-250), { cost: "55.00", time: "14:00" });
  await make("training", "Puppy-school refresher", d.days(-200), { cost: "40.00", time: "18:30" });
  await make("training", "Recall training", d.days(-150), { cost: "40.00", time: "18:30" });
  await make("training", "Recall training", d.days(-120), { cost: "40.00", time: "18:30" });
  await make("grooming", "Summer trim", d.days(-100), { cost: "52.50", time: "14:00" });
  const vetVisit = await make("vet", "Skin irritation check-up", d.days(-28), {
    cost: "72.50",
    followUpDate: d.days(9),
    notes: "Weighed, skin checked. Medication started. Follow-up planned.",
  });
  await make("medication", "Pick up medication refill", d.days(-10), {
    cost: "24.90",
    time: "16:30",
  });
  await make("vet", "Follow-up: skin irritation", d.days(9), { time: "11:15" });
  const deleted = await make("grooming", "Nail trim (entered twice)", d.days(-40), {
    cost: "60.00",
    time: "15:00",
    notes: "Duplicate entry, removed to show restore.",
  });
  must(await deleteAppointment({ db, now: () => d.now }, ctx, deleted), "soft-delete appointment");

  must(
    await addAttachment(
      uploads,
      ctx,
      { type: "appointment", id: vetVisit },
      {
        data: demoPdf("Invoice DEMO-2024-0117", [
          "Clinic: Demo Veterinary Clinic (fictional)",
          "Patient: Luna",
          "Consultation: 45.00 EUR",
          "Skin test: 27.50 EUR",
          "Total: 72.50 EUR",
        ]),
        fileName: "invoice-demo-skin-check.pdf",
        declaredType: "application/pdf",
      },
    ),
    "invoice",
  );
  log("Appointments done.");
}

async function seedFood(db: Database, ctx: Ctx, d: DemoDates, animalId: string): Promise<void> {
  const plan = async (input: {
    brand: string;
    flavor: string;
    type: "dry" | "wet";
    startedOn: string;
    endedOn?: string;
    kcalPer100g?: string;
    startNote?: string;
    endNote?: string;
    meals: { time: string; amount: string }[];
  }) =>
    must(
      await createFoodPlan({ db }, ctx, {
        animalId,
        unit: "g",
        endedOn: "",
        kcalPer100g: "",
        notes: "",
        startNote: "",
        endNote: "",
        ...input,
      }),
      `food ${input.brand}`,
    ).id;

  await plan({
    brand: "Meadow Mill",
    flavor: "Lamb & rice",
    type: "dry",
    startedOn: d.months(-14),
    endedOn: d.days(-90),
    kcalPer100g: "365",
    endNote: "Brand change after the vet visit",
    meals: [
      { time: "07:30", amount: "180" },
      { time: "18:30", amount: "180" },
    ],
  });
  await plan({
    brand: "Harbor Bay",
    flavor: "Salmon pate",
    type: "wet",
    startedOn: d.months(-12),
    meals: [{ time: "18:30", amount: "100" }],
  });
  await plan({
    brand: "Orchard Farm",
    flavor: "Chicken & barley",
    type: "dry",
    startedOn: d.days(-90),
    endedOn: d.days(-20),
    startNote: "Switched brands, mixed in gradually over about a week",
    endNote: "Changed again after the chicken allergy entry",
    meals: [
      { time: "07:30", amount: "170" },
      { time: "18:30", amount: "170" },
    ],
  });
  const current = await plan({
    brand: "Northfield",
    flavor: "Fish & potato (chicken-free)",
    type: "dry",
    startedOn: d.days(-20),
    startNote: "Chicken-free food after the chicken allergy was entered",
    meals: [
      { time: "07:30", amount: "165" },
      { time: "18:30", amount: "165" },
    ],
  });
  must(
    await logPurchase({ db }, ctx, current, {
      date: d.days(-18),
      amount: "54.90",
      currency: "EUR",
      notes: "12 kg bag",
    }),
    "food purchase",
  );
}

async function seedExpenses(
  db: Database,
  uploads: Parameters<typeof addAttachment>[0],
  ctx: Ctx,
  d: DemoDates,
  animalId: string,
  meds: Medications,
): Promise<void> {
  const add = async (
    category:
      "vet" | "food" | "insurance" | "grooming" | "toys" | "medication" | "training" | "other",
    date: string,
    amount: string,
    description: string,
    extra: { medicationId?: string; notes?: string } = {},
  ): Promise<string | null> => {
    if (date > d.today) return null;
    return must(
      await createExpense({ db }, ctx, {
        category,
        date,
        amount,
        currency: "EUR",
        description,
        notes: extra.notes ?? "",
        animalId,
        medicationId: extra.medicationId ?? "",
      }),
      description,
    ).id;
  };

  for (let m = -11; m <= 0; m++) {
    await add("insurance", d.monthStart(m), m < -5 ? "18.50" : "19.90", "Pet insurance premium");
  }
  const food: [number, string, string][] = [
    [-11, "48.90", "Dry food, 12 kg"],
    [-9, "52.40", "Dry food, 12 kg"],
    [-8, "9.95", "Training treats"],
    [-7, "52.40", "Dry food, 12 kg"],
    [-5, "56.00", "Dry food, 12 kg"],
    [-4, "11.50", "Training treats"],
    [-3, "56.00", "Dry food, 12 kg"],
    [-1, "58.30", "Dry food, 12 kg and wet food tray"],
  ];
  const receipts: string[] = [];
  for (const [m, amount, description] of food) {
    const id = await add("food", shift(d, m, 12), amount, description);
    if (id && description.startsWith("Dry food") && receipts.length < 1) receipts.push(id);
  }
  const toys: [number, string, string][] = [
    [-10, "14.95", "Rope toy and ball"],
    [-6, "9.50", "Chew toy"],
    [-3, "21.00", "Snuffle mat"],
    [-1, "6.80", "Tennis balls"],
  ];
  for (const [m, amount, description] of toys) {
    const id = await add("toys", shift(d, m, 20), amount, description);
    if (id && description === "Snuffle mat") receipts.push(id);
  }
  await add("other", shift(d, -9, 3), "25.00", "Dog license renewal");
  await add("other", shift(d, -4, 15), "90.00", "Pet sitter, long weekend");
  // Entered on the last day of a month: only the date is stored, in the household timezone.
  const lateNight = await add("vet", d.monthEnd(-2), "85.00", "Out-of-hours vet consult (23:30)", {
    notes: "Month-end edge: paid at 23:30 on the last day of the month.",
  });
  if (lateNight) receipts.push(lateNight);
  await add("medication", d.days(-60), "32.40", "Skin soothing tablets, 30 pack", {
    medicationId: meds.daily,
  });
  await add("medication", d.days(-30), "32.40", "Skin soothing tablets, 30 pack", {
    medicationId: meds.daily,
  });
  await add("medication", d.days(-9), "11.80", "Ear drops", { medicationId: meds.course });

  for (const [index, id] of receipts.entries()) {
    must(
      await addAttachment(
        uploads,
        ctx,
        { type: "expense", id },
        {
          data: demoPdf(`Receipt DEMO-${1000 + index}`, [
            "Shop: Demo Pet Supplies (fictional)",
            "Thank you for your purchase",
          ]),
          fileName: `receipt-demo-${index + 1}.pdf`,
          declaredType: "application/pdf",
        },
      ),
      "receipt",
    );
  }
}

function shift(d: DemoDates, months: number, day: number): string {
  return `${d.months(months).slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

async function seedDocuments(
  uploads: Parameters<typeof addAttachment>[0],
  ctx: Ctx,
  d: DemoDates,
  animalId: string,
): Promise<void> {
  const docs = [
    {
      type: "registration",
      title: "Registration papers",
      expiresOn: "",
      lines: ["Registered owner: Demo Owner", "Chip: 981000000000042"],
    },
    {
      type: "vaccination",
      title: "Vaccination booklet",
      expiresOn: "",
      lines: ["Rabies booster", "DHPP booster"],
    },
    {
      type: "insurance",
      title: "Insurance contract",
      expiresOn: d.days(300),
      lines: ["Policy DEMO-INS-7788", "Monthly premium: 19.90 EUR"],
    },
    {
      type: "invoice",
      title: "Vet invoice (skin check-up)",
      expiresOn: "",
      lines: ["Total: 72.50 EUR"],
    },
    {
      type: "passport",
      title: "Pet passport",
      expiresOn: d.days(40),
      lines: ["Passport DEMO-PP-0042", "Holder: Luna"],
    },
  ] as const;
  for (const doc of docs) {
    must(
      await createDocument(
        uploads,
        ctx,
        {
          type: doc.type,
          title: `${doc.title} (DEMO)`,
          notes: "Fictional document generated for the demo.",
          expiresOn: doc.expiresOn,
          animalId,
        },
        {
          data: demoPdf(doc.title, [...doc.lines]),
          fileName: `${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-demo.pdf`,
          declaredType: "application/pdf",
        },
      ),
      doc.title,
    );
  }
}
