import { z } from "zod";

/**
 * Brand helper — SPEC §1 convention. Runtime validation is just "non-empty
 * string"; branding is a TypeScript type-level check. Generators in
 * `src/ids/generate.ts` produce prefixed IDs by convention.
 */
export const brand = <T extends string>(_name: T) =>
  z.string().min(1).brand<T>();

/**
 * Money. Integer cents (signed — negative is a credit). v1 locks currency to
 * USD. DB columns carry only `*_cents`; the `currency: "USD"` is reconstructed
 * on read.
 */
export const Money = z.object({
  cents: z.number().int(),
  currency: z.literal("USD"),
});
export type Money = z.infer<typeof Money>;

/** Calendar day, ISO-8601 `YYYY-MM-DD`. */
export const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDay = z.infer<typeof IsoDay>;

/** Point in time, ISO-8601 datetime with timezone. */
export const IsoDate = z.string().datetime();
export type IsoDate = z.infer<typeof IsoDate>;

/**
 * Duration — working days, not calendar. Calendar conversion is a rendering
 * concern per SPEC §1.
 */
export const Duration = z.object({
  days: z.number().int().nonnegative(),
});
export type Duration = z.infer<typeof Duration>;
