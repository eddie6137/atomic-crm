export type EosLink = { url: string; label?: string; kind?: string };

/** Classify a Drive/Slack/other link. Only https URLs are accepted (§6). */
export const linkKind = (url: string): "drive" | "slack" | "link" => {
  try {
    const host = new URL(url).hostname;
    if (/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(host))
      return "drive";
    if (/(^|\.)slack\.com$/.test(host)) return "slack";
  } catch {
    /* fallthrough */
  }
  return "link";
};

export const validateHttpsUrl = (value: unknown) => {
  if (value == null || value === "") return "URL required";
  try {
    const u = new URL(String(value));
    if (u.protocol !== "https:") return "Must be an https:// link";
  } catch {
    return "Invalid URL";
  }
  return undefined;
};

export const normalizeLinks = (
  links: EosLink[] | undefined | null,
): EosLink[] =>
  (links ?? [])
    .filter((l) => l && l.url)
    .map((l) => ({
      url: l.url.trim(),
      label: l.label?.trim() || undefined,
      kind: linkKind(l.url.trim()),
    }));

const BLOCKED_EXT =
  /\.(exe|bat|cmd|com|msi|sh|ps1|js|jar|scr|vbs|dll|app|dmg)$/i;
export const sanitizeFileName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120) || "file";
export const isBlockedFile = (name: string, type?: string) =>
  BLOCKED_EXT.test(name) || /x-msdownload|x-sh|javascript/.test(type ?? "");
