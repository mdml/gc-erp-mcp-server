# Spike — `apply_patch` shape

> **Purpose.** Surface the forks Max needs to resolve before M2 code lands. `apply_patch` is the only commitment-mutation API per [TOOLS.md §3.2](../../TOOLS.md); getting its shape wrong means re-writing the commitment surface twice. The spike reads current schema + TOOLS §6 scenarios, flags where they disagree with themselves, and recommends a resolution per fork with one-line reasoning.
>
> **Scope.** Design-only. No code. The spike resolves into (a) updates to SPEC §1 + TOOLS §3.2 where we agree, (b) ADRs for the load-bearing choices, (c) backlog entries for anything still open. This file deletes once resolved.
>
> **Starting point.** [SPEC §1](../../SPEC.md) has the types; [TOOLS §3.2 + §6](../../TOOLS.md) has the verb + scenarios; [`packages/database/src/schema/patches.ts`](../../packages/database/src/schema/patches.ts) has the Zod already implemented; [`patches/hash.ts`](../../packages/database/src/patches/hash.ts) has the content-addressing already implemented; [ADR 0003](../decisions/0003-storage-split.md) locks D1 + R2 + DO-session-only; [ADR 0004](../decisions/0004-acceptance-testing-strategy.md) locks the test shape.

---

## 1. `CommitmentEdit` op enumeration

### 1.1 Ops currently in the schema

Six ops are in [`src/schema/patches.ts`](../../packages/database/src/schema/patches.ts) today. Re-listing here with the invariants each op must preserve so we can reason about gaps.

| Op | Input (existing Zod) | Invariants the op must preserve |
|---|---|---|
| `create` | `{ op: "create", commitment: Commitment }` | `sum(activation.pricePortion) == price.total` (lump) or `== perUnit * estimatedUnits` (unit); all `scopeIds` resolve to the patch's `jobId`; `counterpartyId` exists; every `activation.activityId` exists; no ID collisions with existing commitments/activations. |
| `setPrice` | `{ op: "setPrice", commitmentId, price: PriceKind }` | Same price-vs-activations-sum invariant re-checked against the *current* activation set; `price.kind` swap (`lump↔unit`) allowed but re-checks. |
| `addActivation` | `{ op: "addActivation", commitmentId, activation: Activation }` | Activation ID not already in use; `activityId` exists; price-vs-sum invariant re-checked (typically means `setPrice` in the same patch, otherwise the invariant breaks). |
| `setActivation` | `{ op: "setActivation", commitmentId, activationId, fields: Activation.omit({id}).partial() }` | Target activation belongs to `commitmentId`; post-merge shape re-parses `Activation`; price-vs-sum invariant re-checked; **`activityId` change is structurally allowed — semantically suspicious (fork §1.2).** |
| `removeActivation` | `{ op: "removeActivation", commitmentId, activationId }` | Target activation belongs to `commitmentId`; commitment retains `min(1)` activation after removal; price-vs-sum invariant re-checked; **orphaned NTP events (fork §1.2).** |
| `void` | `{ op: "void", commitmentId, reason: string }` | Commitment wasn't already voided; committed rollups exclude it afterward; **voided-commitment cost attribution (fork §1.2).** |

**Coverage of TOOLS §6 scenarios.** Day 0 (scaffold) uses no ops. Day 3 (first commitment) uses `create`. Day 18 (direct-cost escape hatch) uses `create` (self-commitment inside `record_direct_cost`). Day 60 (change order) uses `addActivation` + `setPrice`. Nothing in the walkthrough exercises `setActivation`, `removeActivation`, or `void` — but all three are reachable from plausible operator moves (typo in lead time; framer says "drop the punch line, we'll eat it"; "this commitment was a mistake"). Keep them; add a scenario for each in a follow-up pass.

### 1.2 Forks surfaced

- **F1.1 — `setActivation` scope of mutable fields.** Current Zod: `Activation.omit({id}).partial()`, which lets a caller change `activityId` (Lumber Drop → Frame). Semantically shaky: the activation's activity is its identity in the scope tree; swapping it rewrites history. Options: (a) keep as-is and document "use `remove` + `add` if you mean it"; (b) additionally omit `activityId` from `setActivation.fields`, forcing swap-via-remove-and-add. **Recommendation: (b).** *Reasoning: a mis-typed activity should be fixed at `create` time or corrected via an explicit remove/add pair that leaves a clearer patch history.*
- **F1.2 — No `setScopes` / `setCounterparty` / `setSignedOn` op.** A commitment's `scopeIds`, `counterpartyId`, and `signedOn` are all fixed at `create` today. Plausible real-world changes: (a) framer assigns work to a different crew (counterparty change); (b) "this paint commitment should also cover the mud room" (scope add); (c) wrong signing date entered. Options: add individual ops; do nothing (force void + re-create). **Recommendation: do nothing for v1 — force void + re-create.** *Reasoning: counterparty/scope changes are rare and re-creating preserves a cleaner audit trail ("this commitment died, a new one took its place") than an edit log of identity-shifting edits. Revisit if it bites in dogfood.*
- **F1.3 — `removeActivation` with NTPs issued.** Nothing structurally prevents removing an activation that has NTP events pointing at it. Options: (a) invariant error if any NTP exists; (b) cascade-delete the NTPs (bad — silently drops schedule history); (c) allow, leave NTPs orphaned. **Recommendation: (a).** *Reasoning: NTPs are schedule-of-record; losing them silently is worse than forcing the operator to void the whole commitment if the activation is no longer real.*
- **F1.4 — `void` semantics.** What does a voided commitment mean for (i) rollups, (ii) existing NTPs on its activations, (iii) existing costs charged to it? Options: (a) voided commitment disappears from `scope.committed` totals, NTPs preserved for audit, costs remain charged (they happened); (b) void is soft — commitment still counts toward `committed` with a `voided: true` flag. **Recommendation: (a) — voided excluded from rollups, NTPs + costs preserved.** *Reasoning: `void` is the "this contract is dead" verb; keeping it in committed totals defeats the purpose. Costs happened regardless — they stay. NTPs are audit, not rollup.*
- **F1.5 — `setPrice` invariant timing.** If `setPrice` and `addActivation` land in the same patch, the price-vs-sum invariant must be checked *after* all edits in the patch apply, not per-edit. Current code does not have a folder; the invariant check site is a design choice for the handler. **Recommendation: single post-fold invariant check per patch, not per edit.** *Reasoning: a patch is atomic by SPEC — mid-fold invariant violations are expected (add activation without re-pricing, then re-price) and only the final state matters.*

### 1.3 Day 18 direct-cost patch shape

[TOOLS.md §3.3](../../TOOLS.md) describes `record_direct_cost` as "auto-creates a self-commitment (lump, single activation, zero leadTime/buildTime) in a new Patch, then records the Cost against it." Concretely:

- Patch has `edits: [{ op: "create", commitment: {...} }]`.
- Commitment: `counterpartyId = operator's own PartyId`, `scopeIds: [scopeId]`, `price: { kind: "lump", total: amount }`, single activation with `activityId = caller-passed`, `leadTime: 0d, buildTime: 0d`, `pricePortion = amount`.
- Patch `message`: default to `"direct cost — {activityId} — {counterpartyName}"`.
- **F1.6 — Author PartyId for self-commitment.** `record_direct_cost` needs an operator PartyId in two places: as `counterpartyId` on the self-commitment, and as `author` on the patch. M1 has no "current operator" concept yet. Options: (a) pass operator PartyId as an input; (b) bind to the bearer token (one token per operator); (c) server-side config. **Recommendation: (a) for now, revisit when bearer-token-to-operator mapping lands.** *Reasoning: explicit is honest for v1; a well-named input (`operatorPartyId`) makes the dependency visible in every call site.*

---

## 2. Patch id derivation

### 2.1 Current implementation

`packages/database/src/patches/hash.ts` already implements:

```
id = "pat_" + sha256(canonical(parentPatchId, edits, createdAt))
```

where `canonical()` is: `JSON.stringify(sortKeysDeep(value))` with `undefined` fields dropped pre-sort, keys recursively sorted lexicographically, arrays preserved in insertion order. `author` and `message` are **excluded** from the hash (SPEC §1 says so).

### 2.2 What's in the hash, what's not

- **In:** `parentPatchId` (or `null`), every `CommitmentEdit` in `edits` (including all nested fields — commitment shape, activation shape, PriceKind discriminator, Money cents/currency), `createdAt` (ISO datetime string).
- **Out:** `author`, `message`, `jobId` (!). That last one is worth a look — see fork §2.3.

### 2.3 Forks surfaced

- **F2.1 — `jobId` not in hash.** `Patch.jobId` is not a hash input today. Two patches on different jobs with the same edits, parent, and createdAt would collide. Practically impossible (CommitmentId is per-commitment, and a commitment-create edit embeds the CommitmentId), but the hash is sloppier than it needs to be. Options: (a) add `jobId` to the hash input; (b) leave — the CommitmentIds inside edits make collision vanishingly unlikely. **Recommendation: (a).** *Reasoning: cheap to add, makes the hash self-describe the patch's job scope, kills the "vanishingly unlikely" caveat we'd otherwise have to document.*
- **F2.2 — `createdAt` precision and clock skew.** `createdAt` is IsoDate (datetime). Two patches created in the same millisecond with identical edits on the same parent would collide. For a single-operator dogfood product this is a non-issue; for two-operator-on-one-job (post-v1 concurrency) it's a real hazard. Options: (a) ms precision + accept single-operator assumption; (b) sub-ms nanoid tie-breaker in the hash; (c) include `author` in the hash to disambiguate. **Recommendation: (a) for v1, re-evaluate when concurrency lands.** *Reasoning: single-operator assumption is explicit in SPEC; adding a tie-breaker now is YAGNI until the second operator appears on one job. Revisit tied to the concurrency backlog item.*
- **F2.3 — Edit reordering within a patch.** `edits` is an array; order is preserved in the hash. If two operators agree on "add activation + set price" but script them in different order, the hashes differ even though the *effect* is identical. Options: (a) preserve insertion order (current); (b) canonicalize by sorting edits. **Recommendation: (a).** *Reasoning: patches are narrative — the operator expressed intent in an order. Sorting would destroy that. The equivalence-of-effect argument is weak: different orders can produce different intermediate states that invariants see differently (see F1.5).*
- **F2.4 — Floating-point cents.** `Money.cents` is `z.number().int()`. `Activation.throughput.units` is `z.number().positive()` — not integer. A fractional throughput unit serializes as `1.5` or `1.500000001` depending on source. Risk: a patch re-hydrated from DB storing `1.5` vs. a patch freshly computed with `3/2` could stringify differently. Mitigated in practice because we `Zod.parse()` round-trips through JSON.stringify anyway. **Recommendation: document as known edge case in `patches/hash.ts`, don't pre-canonicalize numbers for v1.** *Reasoning: the kitchen walkthrough uses whole-number throughput; actual exposure is theoretical.*
- **F2.5 — Optional-field serialization.** Current `sortKeysDeep` drops `undefined` before stringification — good. But `Commitment.signedOn` is optional IsoDay; some callers may pass `undefined`, others may omit entirely. Current code treats them identically (both dropped). Zod also normalizes (optional absent and present-as-undefined both parse). **Recommendation: keep. Add a hash-contract test that asserts `{signedOn: undefined}` and `{}` produce the same id.** *Reasoning: the invariant is silently held today; locking it with a test prevents accidental regression.*

---

## 3. Patch folding — replay vs. materialize

### 3.1 What the schema already implies

[`packages/database/src/schema/`](../../packages/database/src/schema/) has:

- `patches` table — append-only log of all commitment-mutating patches, edits stored as JSON on the row.
- `commitments`, `activations`, `commitment_scopes` tables — normalized current-state of commitments.

The schema already implies a **materialized projection**: the commitment/activation tables are the query surface, the patches table is the audit log. [ADR 0003](../decisions/0003-storage-split.md) nods at this ("append-only `patches` table + materialized commitment projection") but the write path doesn't exist yet — no code today writes to both.

### 3.2 Options

| Option | Commitment state source | Read cost | Write cost | Audit replay |
|---|---|---|---|---|
| **Pure replay** | `fold(patches WHERE jobId = ?)` on every read | O(patches) per read; every `get_scope_tree` walks the whole chain | 1 insert per patch | Free — replay-to-patch-N is the primary path |
| **Pure materialize** | `SELECT * FROM commitments` (patches table dropped or advisory) | O(1) | 1 insert per patch + N table mutations per patch | Rebuilding a historical state means re-reading all patches anyway → defeats the purpose |
| **Hybrid (current schema)** | `commitments` tables are primary; `patches` is append-only audit alongside | O(1) — indexed FK lookups | 1 insert per patch + N table mutations per patch, **inside one transaction** | Replay `fold(patches WHERE createdAt <= ?)` on demand for audit views |

### 3.3 Recommendation + forks

**Recommendation: hybrid (ratify current schema).** *Reasoning: read-heavy workload (dashboard, `get_scope_tree` rollups, `list_commitments`) with a tiny write rate (dozens of patches per job over its whole life) favors a materialized read path; preserving the `patches` table in the same transaction gives us audit-replay for free when we need it. This matches the schema that's already checked in — we just need to ratify it and build the write path to match.*

- **F3.1 — Write-path atomicity.** `apply_patch` must (a) validate invariants against the post-fold state, (b) insert the patch row, (c) mutate the commitment/activation/commitment_scopes tables to reflect `edits`, all in a single D1 transaction. If any step fails, nothing lands. Options: (a) D1 transaction (supports batched statements but limited cross-statement state); (b) single-SQL-statement-with-CASEs; (c) pessimistic approach with a rollback path. **Recommendation: (a) — use D1 batched statements.** *Reasoning: D1 batches are ACID; explicit transactions match the "atomic patch" semantic; single-SQL is not expressive enough for N commitment-edit fan-out.*
- **F3.2 — Projection-vs-log consistency.** If the `commitments` table is primary and `patches` is audit-only-alongside, a rebuild from `patches` must produce the same `commitments` state. Options: (a) trust the projection, never rebuild; (b) periodic parity check (CI test that replays all patches from a dump and asserts state equality); (c) rebuild-from-patches is the recovery mechanism. **Recommendation: (b) as a dev-tools `scenario` assertion; (c) deferred.** *Reasoning: we don't need a recovery mechanism yet — a correctness-check test on the scenario runner catches divergence early, and the kitchen-walkthrough scenario gives us natural coverage.*
- **F3.3 — Migration implications.** Today: both tables exist, no writer. When `apply_patch` lands, first patch on first deployed job retroactively backfills commitment rows. No live data today — zero-downtime not a constraint. **Recommendation: land `apply_patch` as the first writer; no back-compat migration needed.** *Reasoning: pre-M2, the only commitment data in dev-D1 comes from the seed scripts and scenario runner; both can be reset with the existing `--reset` path.*
- **F3.4 — Snapshot strategy for audit replay.** "Fold to patch N" means re-reading 1..N patches and applying them. For the kitchen job (maybe 10 patches over 6 months), full replay is cheap. For a 100-patch multi-year job, full replay is fine too. **Recommendation: no snapshots for v1.** *Reasoning: the constant is small; snapshotting adds complexity for a bounded audit workload. Revisit if we ever materially exceed the single-operator-five-jobs assumption.*

---

## 4. NTP as an event log

### 4.1 Confirmed: NTP is not a Patch

`CommitmentEdit` has no NTP op; [`ntp_events`](../../packages/database/src/schema/ntp-events.ts) is a standalone table FK'd to `activations`. TOOLS §3.2: "NTP is event-log separate from commitment state." Confirmed across schema, TOOLS, and SPEC.

### 4.2 `NtpEvent` row shape

Already implemented in `src/schema/ntp-events.ts`:

```ts
NTPEvent = {
  id: NTPEventId,                    // ntp_<nanoid21>
  activationId: ActivationId,
  issuedOn: IsoDay,                  // calendar day
  siteReady: boolean,                // operator assertion at issue
  note: string?,
}
```

Append-only: multiple NTPs per activation allowed (re-NTP), latest wins for schedule. Immutable: no update path; re-issue by inserting a new row.

### 4.3 `startBy` / `finishBy` derivation

Per SPEC §1:

```
startBy  = latestNTP(activation).issuedOn + activation.leadTime
finishBy = startBy                         + activation.buildTime
```

"Working days" per the `Duration` type docstring. Calendar ↔ working is a rendering concern, not a schema concern.

### 4.4 Forks surfaced

- **F4.1 — Lead/build time change after NTP issued.** Activation had `leadTime: 5d` when NTP was issued on `2026-04-27`. A later patch does `setActivation({leadTime: 7d})`. What does `startBy` resolve to now — `2026-05-04` (frozen at NTP time) or `2026-05-06` (recomputed from current activation)? Options: (a) freeze at NTP time — snapshot `leadTime`/`buildTime` onto the NTP row at issue; (b) recompute from current activation state always. **Recommendation: (b).** *Reasoning: activations are the schedule contract; if the operator changes the contract after NTP, the schedule moves. Freezing on NTP would mean a patch that extends lead time doesn't affect any already-NTP'd activation, which surprises the operator and splits "what's my schedule?" between old and new views. Option (a) is what G702 pay-app math might want, but that's a pay-app-layer concern, not an NTP-model concern.*
- **F4.2 — `removeActivation` with NTP events.** See fork F1.3. Cross-referenced here: NTP-as-event means NTPs outlive commitment-edit history *only if* the activation they reference outlives the edits. **Recommendation: per F1.3, block `removeActivation` when NTP events exist.** *Reasoning: unified stance.*
- **F4.3 — `siteReady: false` semantics.** Current schema: `siteReady: boolean`, operator asserts at issue time. What does a `siteReady: false` NTP mean — "we told them to start but the site isn't ready"? Possibly an aspirational NTP. Options: (a) boolean as-is; (b) make `siteReady` enforceable — reject NTP issue if false; (c) remove the field and treat NTP as unconditional. **Recommendation: (a) as-is.** *Reasoning: field is operator-documentary, not system-enforced; removing it drops information the operator captured. Don't design an enforcement until a real scenario demands it.*
- **F4.4 — Actual-finish + variance.** SPEC §1 "Derived" block names `actualFinish` and `variance` but there's no event to mark an activation complete. TOOLS.md lists this in backlog ("Closing an activation"). **Recommendation: out of scope for this spike — track in backlog.** *Reasoning: variance is a reporting concern, depends on the unresolved "close an activation" question; M2 is commitment + NTP, closure lands with schedule/pay-app work in M3+.*

---

## 5. `get_scope_tree` rollups

### 5.1 What the tool needs

Per [TOOLS.md §4](../../TOOLS.md): `get_scope_tree({ jobId })` returns `ScopeNode[]` (tree) with `{ committed, cost, variance }` rolled up per node. Day 3 asserts `Kitchen.committed = $8,500`, `Demo.committed = $1,500` (drop + punch), `Framing.committed = $7,000`. Day 14 asserts `Demo.cost = $480`, `Demo.variance = $1,020`.

### 5.2 Where the rollup happens

**Recommendation: TS on an eager-fetched payload.** *Reasoning: a kitchen job fits in ~100 rows (≤10 scopes, ≤10 commitments, ≤30 activations, ≤50 costs). Pulling the full tree + all commitments/activations + all costs for a job in four small queries and folding in TypeScript beats a recursive-CTE rollup on every read (CTE would need `scope_closure` or `WITH RECURSIVE` + aggregates — readable but heavy). Bulk queries → Zod `.parse()` → simple tree-walk in TS. Performance isn't the constraint; clarity is.*

### 5.3 The hidden schema fork

There's a load-bearing fork the rollup cannot sidestep: **how does a commitment that touches multiple scopes distribute `pricePortion` across them?**

Day 3 scenario: Rogelio's framing commitment has `scopeIds: [s_demo, s_framing]` and three activations (drop $500, frame $7000, punch $1000). Assertion: `Demo.committed = $1,500` (drop + punch), `Framing.committed = $7,000` (frame). This only works if **each activation is attributable to exactly one scope, not to the commitment's full scope set.** But `Activation` today has no `scopeId` field — it carries `activityId` (what kind of work) but not `scopeId` (where).

The schema as written does not encode the thing the assertion requires. Two ways out:

- **F5.1 — Add `scopeId: ScopeId` to `Activation`.** Every activation attributes its `pricePortion` to exactly one scope in the commitment's `scopeIds`. Invariant: `activation.scopeId ∈ commitment.scopeIds`. The rollup then becomes: `scope.committed = sum(activation.pricePortion WHERE activation.scopeId ∈ subtree(scope))`, which matches Day 3 exactly.
- **F5.2 — Alternative: distribute evenly across `commitment.scopeIds`.** `$7000 frame / 2 scopes = $3500 per scope` — which breaks the Day 3 assertion immediately. Rejected without even asking.
- **F5.3 — Alternative: require single-scope commitments; merge "Demo" and "Framing" into a single scope for Rogelio's commitment.** Possible but contradicts SPEC §1 (`scopeIds: z.array(ScopeId).min(1)` explicitly supports multiple) and the TOOLS §6 Day 3 setup.

**Recommendation: F5.1 — add `scopeId` to `Activation`.** *Reasoning: the assertion Max already wrote forces this. The alternative is to re-write the Day 3 scenario, and the current shape (activation is "what", scope is "where") matches how operators think about it. This is the biggest fork in the spike and the one Max most needs to see first.* It also resolves the latent "multi-scope commitment" question: scope multiplicity on the commitment becomes a *summary* of the activations' scopes, derivable rather than separately stored — or at least `commitment.scopeIds` becomes a convenience index rather than the source of truth.

### 5.4 Other rollup forks

- **F5.4 — Voided commitments in `committed` rollups.** Per F1.4: voided commitments excluded from `committed`. Costs that were already recorded against them remain in `cost` rollups. Variance = `committed - cost` therefore swings positive (overspend) for voided commitments with costs — which is the honest answer. **Recommendation: document this explicitly in `get_scope_tree` JSDoc.**
- **F5.5 — `cost.activationId` optional.** Today `Cost.activationId` is optional. If F5.1 lands and activations acquire `scopeId`, costs that lack `activationId` must still carry `scopeId` directly (they do — `Cost.scopeId` is required). No change needed; just confirming the rollup has a complete path.
- **F5.6 — Cost rollup subtree traversal.** `scope.cost = sum(Cost.amount WHERE Cost.scopeId ∈ subtree(scope))`. Options: (a) recursive CTE in SQL; (b) in-memory tree walk in TS after flat fetch. **Recommendation: (b), consistent with §5.2.**

---

## 6. Summary of forks for Max

Quick-look table; full reasoning in each section above.

| # | Fork | Recommendation | Load-bearing? |
|---|---|---|---|
| F1.1 | `setActivation` should omit `activityId` | Omit it — force remove+add for activity change | Low — documentation |
| F1.2 | Missing `setScopes` / `setCounterparty` / `setSignedOn` ops | Skip — force void + re-create | Medium — affects change-order UX |
| F1.3 | `removeActivation` with NTPs outstanding | Block with invariant error | Medium — affects NTP model |
| F1.4 | `void` semantics for rollups / NTPs / costs | Exclude from committed; preserve NTPs + costs | **High — defines scope-tree math** |
| F1.5 | Invariant-check timing (per-edit vs. post-fold) | Post-fold only | Medium — handler shape |
| F1.6 | Operator PartyId source for `record_direct_cost` | Explicit input for now | Low — revisit with auth |
| F2.1 | `jobId` in patch hash input | Add it | Low — cheap safety |
| F2.2 | `createdAt` ms collision under concurrency | Ignore for v1 | Low — tied to concurrency backlog |
| F2.3 | Sort edits in hash canonicalization | No — preserve order | Low — intent over math |
| F2.4 | Float-number cents in throughput | Document as known edge | Low — theoretical |
| F2.5 | Lock `undefined`-vs-absent hash equivalence via test | Add test | Low — regression guard |
| F3.1 | Write-path atomicity mechanism | D1 batched statements | **High — correctness** |
| F3.2 | Projection-vs-log parity check | Scenario-runner assertion | Medium — testing shape |
| F3.3 | Migration for projection backfill | None needed | Low — no live data |
| F3.4 | Snapshot strategy for audit replay | Defer | Low — YAGNI |
| F4.1 | Lead/build time change after NTP | Recompute from current activation | **High — schedule semantics** |
| F4.2 | `removeActivation` with NTPs (cross-ref F1.3) | Block | See F1.3 |
| F4.3 | `siteReady: false` enforcement | Leave documentary | Low |
| F4.4 | Activation closure / variance model | Out of scope; backlog | — |
| **F5.1** | **Add `scopeId` to `Activation`** | **Yes — required by Day 3 assertion** | **HIGHEST — re-shapes SPEC §1** |
| F5.4 | Voided commitments flow through to variance | Document in tool JSDoc | Low |
| F5.6 | Rollup compute location | TS in-memory after flat fetch | Low — perf is not the constraint |

---

## 7. If Max agrees on the highest-stakes forks

The shortest path from this spike to code looks like:

1. **F5.1 becomes an ADR.** "Activations carry a `scopeId`" — SPEC §1 update in the same PR. Everything else in the spike is downstream of this, so resolve it first.
2. **F1.4 + F4.1 become ADRs.** Void-exclusion and NTP-derivation-from-current-state are load-bearing semantic choices; both deserve their own record because they'll surface again in pay-app and schedule views.
3. **F3.1 becomes an ADR.** "`apply_patch` uses D1 batched statements for atomicity" — referenced from `packages/mcp-server/CLAUDE.md` so future tool authors follow the pattern.
4. **F1.1 – F1.6, F2.x, F5.4 – F5.6** land as inline comments / JSDoc on the relevant Zod + handler modules. Not ADR-worthy individually.
5. **F4.4** stays in backlog — activation-closure model is M3+ work.

This spike gets deleted once (1) – (4) land.
