// v1d D5: every drawer write is a partial update of exactly one changed field.

/** Fields the drawer may write inline. */
export const INLINE_FIELDS = [
  "title",
  "status",
  "owner_sales_id",
  "due_date",
  "priority",
  "direction",
  "company_id",
] as const;
export type InlineField = (typeof INLINE_FIELDS)[number];

/** Keys no v1d surface may ever send (attachment/link safety, computed fields). */
export const FORBIDDEN_WRITE_KEYS = [
  "attachments",
  "links",
  "new_files",
  "raw",
  "revision",
] as const;

const normalize = (field: InlineField, value: unknown): unknown => {
  if (value === undefined) return null;
  if (typeof value === "string") {
    const t = field === "title" ? value.trim() : value;
    if (t === "") return null;
    return t;
  }
  return value;
};

/**
 * The patch for one inline edit, or null when nothing changed (no write at all).
 * Throws for a blank title, a cleared account (CHECK eos_commitments_company_or_review)
 * or any field outside the inline set.
 */
export const inlinePatch = (
  record: Record<string, any>,
  field: InlineField,
  value: unknown,
): Record<string, unknown> | null => {
  if (!(INLINE_FIELDS as readonly string[]).includes(field))
    throw new Error(`Not an inline field: ${field}`);
  const next = normalize(field, value);
  if (field === "title" && next == null) throw new Error("Title is required");
  if (field === "company_id" && next == null)
    throw new Error("An action needs an account");
  if (field === "status" && next == null) throw new Error("Status is required");
  const prev = record[field] ?? null;
  if (
    String(prev ?? "") === String(next ?? "") &&
    (prev == null) === (next == null)
  )
    return null;
  return { [field]: next };
};

/** True when the account may be edited inline (a project pins the company: v1a trigger). */
export const accountEditable = (record: Record<string, any>) =>
  record.project_id == null;
