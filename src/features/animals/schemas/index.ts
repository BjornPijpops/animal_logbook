import { z } from "zod";

export const SPECIES = [
  "dog",
  "cat",
  "rabbit",
  "guinea_pig",
  "hamster",
  "bird",
  "horse",
  "reptile",
  "fish",
  "other",
] as const;
export type Species = (typeof SPECIES)[number];

// Suggestions only: breed is free text so any breed (or none) is always allowed.
export const BREED_SUGGESTIONS: Partial<Record<Species, readonly string[]>> = {
  dog: [
    "Beagle",
    "Border Collie",
    "Boxer",
    "Chihuahua",
    "Dachshund",
    "French Bulldog",
    "German Shepherd",
    "Golden Retriever",
    "Labrador Retriever",
    "Poodle",
    "Mixed breed",
  ],
  cat: [
    "Bengal",
    "British Shorthair",
    "Maine Coon",
    "Persian",
    "Ragdoll",
    "Siamese",
    "Domestic shorthair",
    "Domestic longhair",
  ],
  rabbit: ["Dwarf", "Holland Lop", "Lionhead", "Rex"],
};

export const GENDERS = ["male", "female", "unknown"] as const;
export const STERILIZED = ["yes", "no", "unknown"] as const;

const text = (max: number) => z.string().trim().max(max);

export const animalInputSchema = z
  .object({
    name: text(80).min(1),
    species: z.enum(SPECIES),
    speciesOther: text(60),
    breed: text(80),
    gender: z.enum(GENDERS),
    birthDate: z.union([z.literal(""), z.iso.date()]),
    birthDateIsEstimate: z.boolean(),
    colorMarkings: text(200),
    chipNumber: text(32),
    registrationNumber: text(64),
    sterilized: z.enum(STERILIZED),
    emergencyNotes: text(2000),
  })
  .refine((v) => v.species !== "other" || v.speciesOther.length > 0, {
    path: ["speciesOther"],
  });
export type AnimalInput = z.infer<typeof animalInputSchema>;

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const weightInputSchema = z.object({
  weight: z.number().positive().max(2000),
  unit: z.enum(WEIGHT_UNITS),
  measuredOn: z.iso.date(),
  note: text(200),
});
export type WeightInput = z.infer<typeof weightInputSchema>;

export const uuidSchema = z.uuid();

const GRAMS_PER_LB = 453.59237;

export function toGrams(weight: number, unit: WeightUnit): number {
  return Math.round(unit === "kg" ? weight * 1000 : weight * GRAMS_PER_LB);
}

export function fromGrams(grams: number, unit: WeightUnit): number {
  const value = unit === "kg" ? grams / 1000 : grams / GRAMS_PER_LB;
  return Math.round(value * 100) / 100;
}

export const MAX_PHOTOS_PER_ANIMAL = 20;

export function asSpecies(value: string): Species {
  return SPECIES.find((s) => s === value) ?? "other";
}

export const EMPTY_ANIMAL_INPUT: AnimalInput = {
  name: "",
  species: "dog",
  speciesOther: "",
  breed: "",
  gender: "unknown",
  birthDate: "",
  birthDateIsEstimate: false,
  colorMarkings: "",
  chipNumber: "",
  registrationNumber: "",
  sterilized: "unknown",
  emergencyNotes: "",
};
