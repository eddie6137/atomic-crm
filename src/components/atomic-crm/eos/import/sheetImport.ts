/**
 * Lossless sheet → EOS import (spec §4.2–4.4), connector-agnostic.
 * Pure functions: parse + map + checksum. `applyImport` persists via the
 * react-admin dataProvider (same Atomic data layer used by dataImport/*).
 */
import type { SheetTab } from "./fixture";

export type Cell = {
  index: number;
  label: string;
  value: string | null;
  formula?: string;
};
export type ColumnInfo = {
  index: number;
  label: string;
  mapped_to: string | null;
};
export type Lookup = {
  companies: { id: number | string; name: string }[];
  sales: {
    id: number | string;
    first_name: string;
    last_name: string;
    email: string;
  }[];
};
export type ParsedRow = {
  ordinal: number;
  hidden: boolean;
  cells: Cell[];
  record: Record<string, any>;
  needs_review: boolean;
  reasons: string[];
};
export type Target = "eos_commitments" | "eos_issues";

const ALIASES: Record<Target, Record<string, string>> = {
  eos_commitments: {
    id: "legacy_id",
    "eos id": "legacy_id",
    account: "company",
    client: "company",
    company: "company",
    commitment: "title",
    title: "title",
    owner: "owner",
    responsible: "owner",
    who: "owner",
    "due date": "due",
    due: "due",
    date: "due",
    status: "status",
    state: "status",
    priority: "priority",
    type: "type",
    category: "type",
    "definition of done": "definition_of_done",
    speaker: "speaker",
    source: "source_url",
    direction: "direction",
    blocker: "blocker",
    reason: "status_reason",
  },
  eos_issues: {
    id: "legacy_id",
    "eos id": "legacy_id",
    issue: "title",
    title: "title",
    account: "company",
    client: "company",
    company: "company",
    "raised by": "raised_by",
    "date raised": "raised_at",
    raised: "raised_at",
    owner: "owner",
    responsible: "owner",
    priority: "priority",
    status: "status",
    type: "type",
    category: "type",
    resolution: "solution",
    "solved date": "resolved_at",
    due: "due",
    "due date": "due",
    description: "detail",
    detail: "detail",
  },
};

const STATUS_MAP: Record<Target, Record<string, string>> = {
  eos_commitments: {
    open: "open",
    "in progress": "in_progress",
    blocked: "blocked",
    done: "completed",
    complete: "completed",
    completed: "completed",
    cancelled: "cancelled",
    canceled: "cancelled",
    superseded: "superseded",
    lapsed: "lapsed",
  },
  eos_issues: {
    open: "open",
    ids: "ids",
    solved: "solved",
    resolved: "solved",
    dropped: "dropped",
  },
};

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const isEmpty = (v: string | null | undefined) =>
  v == null || String(v).trim() === "";

/** ISO yyyy-mm-dd or US m/d/yyyy only; anything else is kept raw (no guessed dates). */
export const parseDate = (v: string | null): string | null => {
  if (isEmpty(v)) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
};

export const canonicalJson = (v: unknown): string => {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
};

export const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const SEMANTIC_FIELDS = [
  "legacy_id",
  "title",
  "company_id",
  "owner_sales_id",
  "owner_text",
  "status",
  "status_text",
  "due_date",
  "due_text",
  "priority",
  "type",
  "raised_by",
  "raised_at",
  "solution",
  "needs_review",
] as const;

export const semanticKey = (rec: Record<string, any>) =>
  canonicalJson(
    Object.fromEntries(SEMANTIC_FIELDS.map((f) => [f, rec[f] ?? null])),
  );

export const parseTab = (tab: SheetTab, target: Target, lookup: Lookup) => {
  const header = tab.values[tab.headerRow - 1] ?? [];
  const width = Math.max(...tab.values.map((r) => r.length));
  const aliases = ALIASES[target];
  const seen = new Set<string>();
  const columns: ColumnInfo[] = Array.from({ length: width }, (_, i) => {
    const label = header[i] ?? "";
    const key = aliases[norm(label)] ?? null;
    // first occurrence of a known alias maps; duplicates/blank/unknown stay raw-only
    const mapped = key && !seen.has(key) ? key : null;
    if (mapped) seen.add(mapped);
    return { index: i, label: String(label), mapped_to: mapped };
  });
  const colOf = (k: string) => columns.find((c) => c.mapped_to === k)?.index;

  const companyByName = new Map(
    lookup.companies.map((c) => [norm(c.name), c.id]),
  );
  const ownerBy = new Map<string, number | string>();
  lookup.sales.forEach((s) => {
    ownerBy.set(norm(`${s.first_name} ${s.last_name}`), s.id);
    ownerBy.set(norm(s.email), s.id);
  });
  const hidden = new Set(tab.hiddenRows ?? []);
  const legacySeen = new Map<string, number>();

  const rows: ParsedRow[] = [];
  let positions = 0;
  for (let r = tab.headerRow; r < tab.values.length; r++) {
    positions++;
    const ordinal = r + 1;
    const line = tab.values[r] ?? [];
    const cells: Cell[] = columns.map((c) => {
      const formula = tab.formulas?.[`${ordinal},${c.index + 1}`];
      const cell: Cell = {
        index: c.index,
        label: c.label,
        value: line[c.index] ?? null,
      };
      if (formula) cell.formula = formula;
      return cell;
    });
    if (cells.every((c) => isEmpty(c.value) && !c.formula)) continue; // structurally blank: counted in positions only

    const get = (k: string) => {
      const i = colOf(k);
      return i == null ? null : (line[i] ?? null);
    };
    const reasons: string[] = [];
    const rec: Record<string, any> = {};
    rec.legacy_id = isEmpty(get("legacy_id"))
      ? null
      : String(get("legacy_id")).trim();
    if (rec.legacy_id) {
      if (legacySeen.has(rec.legacy_id))
        reasons.push(
          `duplicate legacy ID (also row ${legacySeen.get(rec.legacy_id)})`,
        );
      else legacySeen.set(rec.legacy_id, ordinal);
    }
    const title = get("title");
    rec.title = isEmpty(title)
      ? `(untitled sheet row ${ordinal})`
      : String(title).trim();
    if (isEmpty(title)) reasons.push("missing title");

    const company = get("company");
    rec.company_id = isEmpty(company)
      ? null
      : (companyByName.get(norm(company)) ?? null);
    if (rec.company_id == null)
      reasons.push(
        isEmpty(company) ? "missing account" : `unknown account "${company}"`,
      );

    const owner = get("owner");
    rec.owner_text = isEmpty(owner) ? null : String(owner);
    rec.owner_sales_id = isEmpty(owner)
      ? null
      : (ownerBy.get(norm(owner)) ?? null);
    if (!isEmpty(owner) && rec.owner_sales_id == null)
      reasons.push(`unknown owner "${owner}"`);

    const status = get("status");
    rec.status_text = isEmpty(status) ? null : String(status);
    const mappedStatus = isEmpty(status)
      ? null
      : STATUS_MAP[target][norm(status)];
    rec.status =
      mappedStatus ??
      (target === "eos_commitments"
        ? isEmpty(status)
          ? "open"
          : "ambiguous"
        : "open");
    if (!isEmpty(status) && !mappedStatus)
      reasons.push(`unmapped status "${status}"`);

    const due = get("due");
    rec.due_text = isEmpty(due) ? null : String(due);
    rec.due_date = parseDate(due);
    if (!isEmpty(due) && !rec.due_date) reasons.push(`unparsed date "${due}"`);

    for (const k of ["priority", "type"]) {
      const v = get(k);
      rec[k] = isEmpty(v) ? null : norm(v); // no fabricated default priority
    }
    if (target === "eos_issues") {
      rec.raised_by = isEmpty(get("raised_by"))
        ? null
        : String(get("raised_by"));
      rec.raised_at = parseDate(get("raised_at"));
      if (!isEmpty(get("raised_at")) && !rec.raised_at)
        reasons.push("unparsed raised date");
      rec.solution = isEmpty(get("solution")) ? null : String(get("solution"));
      rec.resolved_at = parseDate(get("resolved_at"));
      if (!isEmpty(get("detail"))) rec.detail = String(get("detail"));
    } else {
      for (const k of [
        "definition_of_done",
        "speaker",
        "source_url",
        "blocker",
        "status_reason",
      ]) {
        const v = get(k);
        if (!isEmpty(v)) rec[k] = String(v);
      }
    }
    if (hidden.has(ordinal))
      reasons.push("hidden row in sheet (imported, flagged)");
    if (cells.some((c) => c.formula))
      reasons.push("contains formula (stored as text, not executed)");
    rec.needs_review =
      reasons.some(
        (x) => !x.startsWith("hidden row") && !x.startsWith("contains formula"),
      ) || rec.company_id == null;
    rec.raw = {
      sheet: tab.tabName,
      tab_id: tab.tabId,
      row: ordinal,
      hidden: hidden.has(ordinal),
      cells,
    };
    rows.push({
      ordinal,
      hidden: hidden.has(ordinal),
      cells,
      record: rec,
      needs_review: rec.needs_review,
      reasons,
    });
  }
  return { columns, rows, positions, width };
};

export const buildReport = async (
  tab: SheetTab,
  target: Target,
  parsed: ReturnType<typeof parseTab>,
) => {
  const snapshot = canonicalJson({
    tab: tab.tabName,
    tabId: tab.tabId,
    values: tab.values,
    formulas: tab.formulas ?? {},
    hidden: tab.hiddenRows ?? [],
  });
  const rawCanon = parsed.rows
    .map((r) =>
      canonicalJson([
        r.ordinal,
        r.cells.map((c) => [c.index, c.value, c.formula ?? null]),
      ]),
    )
    .join("\n");
  const semCanon = parsed.rows
    .map((r) => semanticKey(r.record))
    .sort()
    .join("\n");
  return {
    target,
    tab_name: tab.tabName,
    tab_id: tab.tabId,
    header_row: tab.headerRow,
    snapshot_sha256: await sha256(snapshot),
    row_positions: parsed.positions,
    nonempty_rows: parsed.rows.length,
    canonical_records: parsed.rows.length,
    needs_review_records: parsed.rows.filter((r) => r.needs_review).length,
    hidden_rows_imported: parsed.rows.filter((r) => r.hidden).length,
    column_count: parsed.width,
    columns: parsed.columns,
    unmapped_columns: parsed.columns
      .filter((c) => !c.mapped_to)
      .map((c) => `${c.index}:${c.label || "(blank)"}`),
    raw_checksum: await sha256(rawCanon),
    semantic_checksum: await sha256(semCanon),
    review: parsed.rows
      .filter((r) => r.reasons.length)
      .map((r) => ({ row: r.ordinal, reasons: r.reasons })),
  };
};

/** Persist batch + records + raw rows, then reconcile by re-reading from the DB. */
export const applyImport = async (
  dataProvider: any,
  tab: SheetTab,
  target: Target,
  lookup: Lookup,
) => {
  const parsed = parseTab(tab, target, lookup);
  const report = await buildReport(tab, target, parsed);

  const existing = await dataProvider.getList("eos_import_batches", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "created_at", order: "DESC" },
    filter: { snapshot_sha256: report.snapshot_sha256, tab_name: tab.tabName },
  });
  if (existing.total > 0) {
    const prev = await dataProvider.getList("eos_import_reconciliations", {
      pagination: { page: 1, perPage: 1 },
      sort: { field: "created_at", order: "DESC" },
      filter: { batch_id: existing.data[0].id },
    });
    return {
      report,
      batchId: existing.data[0].id,
      skipped: true,
      reconciliation: prev.data[0]?.result,
    };
  }

  const { data: batch } = await dataProvider.create("eos_import_batches", {
    data: {
      source: "fixture",
      tab_name: tab.tabName,
      tab_id: tab.tabId,
      snapshot_sha256: report.snapshot_sha256,
      header_row: tab.headerRow,
      row_positions: report.row_positions,
      nonempty_rows: report.nonempty_rows,
      canonical_records: report.canonical_records,
      needs_review_records: report.needs_review_records,
      column_count: report.column_count,
      columns: report.columns,
      raw_checksum: report.raw_checksum,
      semantic_checksum: report.semantic_checksum,
      report: { ...report, reconciliation: "pending" },
    },
  });

  const ids: string[] = [];
  for (const row of parsed.rows) {
    const id = crypto.randomUUID();
    const importRowId = crypto.randomUUID();
    await dataProvider.create(target, {
      data: { ...row.record, id, import_row_id: importRowId },
    });
    await dataProvider.create("eos_import_rows", {
      data: {
        id: importRowId,
        batch_id: batch.id,
        row_ordinal: row.ordinal,
        raw: { cells: row.cells, hidden: row.hidden },
        row_sha256: await sha256(canonicalJson(row.cells)),
        target_table: target,
        target_id: id,
        needs_review: row.needs_review,
        review_reasons: row.reasons,
      },
    });
    ids.push(id);
  }

  // Reconcile: re-read from DB and recompute counts + semantic checksum.
  const { data: stored } = await dataProvider.getMany(target, { ids });
  const { total: storedRows } = await dataProvider.getList("eos_import_rows", {
    pagination: { page: 1, perPage: 1 },
    sort: { field: "row_ordinal", order: "ASC" },
    filter: { batch_id: batch.id },
  });
  const dbSemantic = await sha256(
    stored
      .map((r: any) => semanticKey(r))
      .sort()
      .join("\n"),
  );
  const missing = ids.filter((id) => !stored.find((s: any) => s.id === id));
  const reconciliation = {
    source_nonempty_rows: report.nonempty_rows,
    db_records: stored.length,
    db_raw_rows: storedRows,
    semantic_checksum_source: report.semantic_checksum,
    semantic_checksum_db: dbSemantic,
    missing_ids: missing,
    ok:
      stored.length === report.nonempty_rows &&
      storedRows === report.nonempty_rows &&
      dbSemantic === report.semantic_checksum &&
      missing.length === 0,
  };
  await dataProvider.create("eos_import_reconciliations", {
    data: { batch_id: batch.id, ok: reconciliation.ok, result: reconciliation },
  });
  return { report, batchId: batch.id, skipped: false, reconciliation };
};
