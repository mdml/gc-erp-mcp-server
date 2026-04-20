import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import {
  buildRecordCostArguments,
  type CostSourceKind,
  canSave,
  type FormState,
  initialState,
  missingIds,
  type PrefillContext,
  resetSource,
  updateSourceField,
} from "./form";

// The view renders a form whose read-only displays show resolved names from
// structuredContent and whose editable fields default to any server-supplied
// value. Save is disabled until canSave() returns true. See apps/cost-entry-
// form/CLAUDE.md for the attestation invariant the Save button guarantees.

const app = new App({ name: "cost-entry-form", version: "0.1.0" });

// Handlers are registered BEFORE connect() because the host can push
// ui/notifications/tool-input and ui/notifications/tool-result immediately
// after the handshake — per the vendor guide §3.

let state: FormState = initialState({});

app.ontoolinput = (params) => {
  // Claude's original call args to cost_entry_form. Not the pre-fill payload
  // (that arrives via ontoolresult), but useful to seed fields the server
  // hasn't resolved yet. Merge conservatively — don't overwrite anything the
  // tool result will fill in more accurately.
  const args = params.arguments;
  if (!args) return;
  const seeded: PrefillContext = { ...state.prefill };
  for (const key of [
    "jobId",
    "scopeId",
    "commitmentId",
    "activityId",
    "counterpartyId",
  ] as const) {
    const v = args[key];
    if (typeof v === "string" && seeded[key] === undefined) seeded[key] = v;
  }
  state = { ...state, prefill: seeded };
  render();
};

app.ontoolresult = (result) => {
  // structuredContent is the server's resolved pre-fill. Shape matches
  // PrefillContext (see record_cost.ts and apps/cost-entry-form/CLAUDE.md).
  const sc = (result as { structuredContent?: unknown }).structuredContent;
  if (sc && typeof sc === "object") {
    state = initialState(sc as PrefillContext);
    render();
  }
};

app.onhostcontextchanged = (_ctx) => {
  // Theme / locale / platform. M3 ships default styling; a later slice may
  // mirror host theme vars here.
};

app.onteardown = async () => ({});

await app.connect(new PostMessageTransport(window.parent, window.parent));

// ---------------------------------------------------------------------------
// DOM wiring — pure rendering + the Save click handler (the attestation).
// ---------------------------------------------------------------------------

function render(): void {
  setReadonly("jobName", state.prefill.jobName);
  setReadonly("scopeName", state.prefill.scopeName);
  setReadonly("commitmentLabel", state.prefill.commitmentLabel);
  setReadonly("activityName", state.prefill.activityName);
  setReadonly("counterpartyName", state.prefill.counterpartyName);

  setInputValue(
    "amount",
    state.amountCents === null ? "" : String(state.amountCents),
  );
  setInputValue("incurredOn", state.incurredOn);
  setInputValue("memo", state.memo);
  setInputValue("sourceKind", state.source.kind);

  renderSourceDetail();
  renderMissingHint();

  const save = getEl<HTMLButtonElement>("save");
  save.disabled = !canSave(state);
}

function setReadonly(id: string, value: string | undefined): void {
  const el = getEl<HTMLElement>(id);
  el.textContent = value ?? "—";
}

function setInputValue(id: string, value: string): void {
  const el = getEl<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    id,
  );
  if (el.value !== value) el.value = value;
}

function renderSourceDetail(): void {
  const detail = getEl<HTMLDivElement>("sourceDetail");
  detail.innerHTML = "";
  const kind = state.source.kind;
  if (kind === "invoice") {
    detail.appendChild(
      labeledInput(
        "invoiceNumber",
        "Invoice number",
        state.source.invoiceNumber,
      ),
    );
    detail.appendChild(
      labeledInput(
        "receivedOn",
        "Received on",
        state.source.receivedOn,
        "date",
      ),
    );
  } else if (kind === "direct") {
    detail.appendChild(
      labeledInput("directNote", "Note (optional)", state.source.note ?? ""),
    );
  } else if (kind === "tm") {
    detail.appendChild(
      labeledInput(
        "tmHours",
        "Hours (optional)",
        state.source.hours === undefined ? "" : String(state.source.hours),
        "number",
      ),
    );
  } else {
    detail.appendChild(labeledInput("reason", "Reason", state.source.reason));
  }
}

function labeledInput(
  id: string,
  label: string,
  value: string,
  type = "text",
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = type;
  input.id = id;
  input.value = value;
  input.addEventListener("input", onSourceDetailInput);
  wrap.append(span, input);
  return wrap;
}

function renderMissingHint(): void {
  const hint = getEl<HTMLDivElement>("missingHint");
  const missing = missingIds(state.prefill);
  if (missing.length === 0) {
    hint.hidden = true;
    hint.textContent = "";
    return;
  }
  hint.hidden = false;
  hint.textContent = `Missing: ${missing.join(", ")}. Re-open the form with full context.`;
}

function onSourceDetailInput(e: Event): void {
  const el = e.currentTarget as HTMLInputElement;
  state = {
    ...state,
    source: updateSourceField(state.source, el.id, el.value),
  };
  const save = getEl<HTMLButtonElement>("save");
  save.disabled = !canSave(state);
}

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

function onAmountInput(e: Event): void {
  const v = (e.currentTarget as HTMLInputElement).value;
  const n = v === "" ? null : Number(v);
  state = { ...state, amountCents: n };
  const save = getEl<HTMLButtonElement>("save");
  save.disabled = !canSave(state);
}

function onIncurredOnInput(e: Event): void {
  state = {
    ...state,
    incurredOn: (e.currentTarget as HTMLInputElement).value,
  };
  const save = getEl<HTMLButtonElement>("save");
  save.disabled = !canSave(state);
}

function onMemoInput(e: Event): void {
  state = { ...state, memo: (e.currentTarget as HTMLTextAreaElement).value };
}

function onSourceKindChange(e: Event): void {
  const kind = (e.currentTarget as HTMLSelectElement).value as CostSourceKind;
  state = { ...state, source: resetSource(kind) };
  render();
}

async function onSaveClick(e: MouseEvent): Promise<void> {
  // The attestation: only a real user click submits. Synthetic clicks from
  // inside the sandboxed iframe are rejected defensively — see CLAUDE.md for
  // why the button is the product.
  if (!e.isTrusted) return;
  if (!canSave(state)) return;
  const save = getEl<HTMLButtonElement>("save");
  save.disabled = true;
  try {
    const args = buildRecordCostArguments(state);
    await app.callServerTool({
      name: "record_cost",
      arguments: args as unknown as Record<string, unknown>,
    });
  } finally {
    save.disabled = !canSave(state);
  }
}

// Wire event listeners once, after the DOM is live.
getEl<HTMLInputElement>("amount").addEventListener("input", onAmountInput);
getEl<HTMLInputElement>("incurredOn").addEventListener(
  "input",
  onIncurredOnInput,
);
getEl<HTMLTextAreaElement>("memo").addEventListener("input", onMemoInput);
getEl<HTMLSelectElement>("sourceKind").addEventListener(
  "change",
  onSourceKindChange,
);
getEl<HTMLButtonElement>("save").addEventListener("click", onSaveClick);

render();
