/**
 * Pure form logic for cost-entry-form. Runtime bootstrap is in main.ts.
 *
 * The server pre-fills `PrefillContext` via `ontoolresult`'s
 * `structuredContent`. IDs are display-only in the UI but form the spine of the
 * eventual `record_cost` payload — the Save button is disabled until every
 * required ID is present. Editable fields (`amount`, `incurredOn`, `memo`,
 * `source`) default to any server-provided value and stay editable.
 *
 * Shape matches RecordCostInput in apps/mcp-server/src/tools/record_cost.ts.
 */

// ---------------------------------------------------------------------------
// CostSource — mirrored from @gc-erp/database. Cross-workspace import would
// pull server-side deps into the view bundle; this is a narrow structural
// copy. If CostSource grows a variant *that the form can produce*, both sides
// update in the same PR.
//
// Intentionally omitted: the canonical CostSource in packages/database/src/
// schema/costs.ts has `documentId?: DocumentId` on invoice/direct/tm. The
// form doesn't wire an attachment picker in M3, so the field would be
// dead weight on the view side; zod's `.optional()` keeps the submission
// shape valid without it. When a future slice adds an attachment UI, update
// this mirror and the form UI in the same PR.
// ---------------------------------------------------------------------------

export type CostSourceKind = "invoice" | "direct" | "tm" | "adjustment";

export type CostSource =
  | { kind: "invoice"; invoiceNumber: string; receivedOn: string }
  | { kind: "direct"; note?: string }
  | { kind: "tm"; hours?: number }
  | { kind: "adjustment"; reason: string };

// ---------------------------------------------------------------------------
// Pre-fill context from the server's tool result.
// ---------------------------------------------------------------------------

// activationId is not on this shape yet: the server-side CostEntryFormInput
// (apps/mcp-server/src/tools/cost_entry_form.resolver.ts) neither accepts it
// as input nor echoes it in structuredContent. Add it here and in the
// submission builder in the same PR that extends the server to resolve an
// activation; wiring one side without the other is the exact drift CLAUDE.md
// warns against.
export interface PrefillContext {
  jobId?: string;
  jobName?: string;
  scopeId?: string;
  scopeName?: string;
  commitmentId?: string;
  commitmentLabel?: string;
  activityId?: string;
  activityName?: string;
  counterpartyId?: string;
  counterpartyName?: string;
  amountCents?: number;
  incurredOn?: string;
  memo?: string;
}

// ---------------------------------------------------------------------------
// In-memory form state.
// ---------------------------------------------------------------------------

export interface FormState {
  prefill: PrefillContext;
  amountCents: number | null;
  incurredOn: string;
  memo: string;
  source: CostSource;
}

export const DEFAULT_SOURCE: CostSource = {
  kind: "invoice",
  invoiceNumber: "",
  receivedOn: "",
};

export function initialState(prefill: PrefillContext): FormState {
  return {
    prefill,
    amountCents: prefill.amountCents ?? null,
    incurredOn: prefill.incurredOn ?? "",
    memo: prefill.memo ?? "",
    source: DEFAULT_SOURCE,
  };
}

// ---------------------------------------------------------------------------
// Missing-context — which required IDs the server didn't pre-fill.
// ---------------------------------------------------------------------------

export type RequiredIdField =
  | "jobId"
  | "scopeId"
  | "commitmentId"
  | "activityId"
  | "counterpartyId";

const REQUIRED_IDS: readonly RequiredIdField[] = [
  "jobId",
  "scopeId",
  "commitmentId",
  "activityId",
  "counterpartyId",
];

export function missingIds(
  prefill: PrefillContext,
): readonly RequiredIdField[] {
  return REQUIRED_IDS.filter((k) => !prefill[k]);
}

// ---------------------------------------------------------------------------
// Editable-field validation.
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDay(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidAmountCents(n: number | null): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

export function isValidSource(s: CostSource): boolean {
  switch (s.kind) {
    case "invoice":
      return s.invoiceNumber.trim().length > 0 && isValidIsoDay(s.receivedOn);
    case "direct":
      return true;
    case "tm":
      return (
        s.hours === undefined || (Number.isFinite(s.hours) && s.hours >= 0)
      );
    case "adjustment":
      return s.reason.trim().length > 0;
  }
}

// ---------------------------------------------------------------------------
// Source-field updates — one helper per CostSource variant so main.ts can
// hand each edit event to a single function keyed by the current kind.
// Switching kinds is handled by `resetSource`; within a kind, field updates
// dispatch by id.
// ---------------------------------------------------------------------------

export function resetSource(kind: CostSourceKind): CostSource {
  if (kind === "invoice") return { kind, invoiceNumber: "", receivedOn: "" };
  if (kind === "direct") return { kind };
  if (kind === "tm") return { kind };
  return { kind, reason: "" };
}

type FieldUpdater = (source: CostSource, value: string) => CostSource;

const INVOICE_UPDATERS: Record<string, FieldUpdater> = {
  invoiceNumber: (s, v) =>
    s.kind === "invoice" ? { ...s, invoiceNumber: v } : s,
  receivedOn: (s, v) => (s.kind === "invoice" ? { ...s, receivedOn: v } : s),
};

const DIRECT_UPDATERS: Record<string, FieldUpdater> = {
  directNote: (s, v) =>
    s.kind === "direct" ? { ...s, note: v || undefined } : s,
};

const TM_UPDATERS: Record<string, FieldUpdater> = {
  tmHours: (s, v) => {
    if (s.kind !== "tm") return s;
    return { ...s, hours: v === "" ? undefined : Number(v) };
  },
};

const ADJUSTMENT_UPDATERS: Record<string, FieldUpdater> = {
  reason: (s, v) => (s.kind === "adjustment" ? { ...s, reason: v } : s),
};

const UPDATERS_BY_KIND: Record<CostSourceKind, Record<string, FieldUpdater>> = {
  invoice: INVOICE_UPDATERS,
  direct: DIRECT_UPDATERS,
  tm: TM_UPDATERS,
  adjustment: ADJUSTMENT_UPDATERS,
};

export function updateSourceField(
  source: CostSource,
  fieldId: string,
  value: string,
): CostSource {
  const updater = UPDATERS_BY_KIND[source.kind][fieldId];
  return updater ? updater(source, value) : source;
}

// ---------------------------------------------------------------------------
// Save-button predicate — the attestation gate.
//
// Disabled whenever we'd be asking the operator to sign off on a payload the
// server would reject. That means: every required ID must be present, every
// editable field must validate. Keep this tight — a disabled Save with an
// unclear reason is better than a Save that round-trips a 400.
// ---------------------------------------------------------------------------

export function canSave(state: FormState): boolean {
  if (missingIds(state.prefill).length > 0) return false;
  if (!isValidAmountCents(state.amountCents)) return false;
  if (!isValidIsoDay(state.incurredOn)) return false;
  if (!isValidSource(state.source)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Submission — build the arguments object for `record_cost`. Only callable
// when canSave() is true. Keep optional fields out of the payload when unset,
// matching the record_cost tool's shape.
// ---------------------------------------------------------------------------

export interface RecordCostArguments {
  jobId: string;
  scopeId: string;
  commitmentId: string;
  activityId: string;
  counterpartyId: string;
  amount: { cents: number; currency: "USD" };
  incurredOn: string;
  source: CostSource;
  memo?: string;
}

export class FormNotReadyError extends Error {
  constructor() {
    super("cost-entry-form: canSave() is false — refusing to build submission");
    this.name = "FormNotReadyError";
  }
}

export function buildRecordCostArguments(
  state: FormState,
): RecordCostArguments {
  if (!canSave(state)) throw new FormNotReadyError();
  const p = state.prefill;
  // Non-null asserts are safe here: canSave gates missingIds + valid amount.
  const args: RecordCostArguments = {
    jobId: p.jobId as string,
    scopeId: p.scopeId as string,
    commitmentId: p.commitmentId as string,
    activityId: p.activityId as string,
    counterpartyId: p.counterpartyId as string,
    amount: { cents: state.amountCents as number, currency: "USD" },
    incurredOn: state.incurredOn,
    source: state.source,
  };
  const memo = state.memo.trim();
  if (memo.length > 0) args.memo = memo;
  return args;
}
