/**
 * Starter activity library — TOOLS.md §7. Seeded on first boot; extended at
 * runtime via `ensure_activity`. Pure data — no imports from runtime schema
 * so drizzle-kit never accidentally picks this up as a table.
 */

export interface StarterActivity {
  slug: string;
  name: string;
  defaultUnit?: string;
}

export const STARTER_ACTIVITIES: readonly StarterActivity[] = [
  { slug: "lumber_drop", name: "Lumber Drop" },
  { slug: "frame", name: "Frame", defaultUnit: "lf" },
  { slug: "demo", name: "Demolition" },
  { slug: "electrical_rough", name: "Electrical Rough-in" },
  { slug: "electrical_trim", name: "Electrical Trim" },
  { slug: "plumbing_rough", name: "Plumbing Rough-in" },
  { slug: "plumbing_trim", name: "Plumbing Trim" },
  { slug: "drywall_hang", name: "Drywall Hang", defaultUnit: "sqft" },
  { slug: "drywall_finish", name: "Drywall Finish", defaultUnit: "sqft" },
  { slug: "paint", name: "Paint", defaultUnit: "sqft" },
  { slug: "cabinet_delivery", name: "Cabinet Delivery" },
  { slug: "cabinet_install", name: "Cabinet Install" },
  { slug: "countertop_template", name: "Countertop Template" },
  {
    slug: "countertop_install",
    name: "Countertop Install",
    defaultUnit: "sqft",
  },
  { slug: "backsplash", name: "Backsplash", defaultUnit: "sqft" },
  { slug: "appliance_delivery", name: "Appliance Delivery" },
  { slug: "appliance_install", name: "Appliance Install" },
  { slug: "flooring", name: "Flooring", defaultUnit: "sqft" },
  { slug: "tile", name: "Tile", defaultUnit: "sqft" },
  { slug: "punch", name: "Punch List" },
  { slug: "materials_direct", name: "Materials (Direct)" },
  { slug: "labor_tm", name: "Labor (T&M)", defaultUnit: "hr" },
];
