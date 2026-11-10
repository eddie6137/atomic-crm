// Admin-only company attribution columns (enforced server-side by eos_companies_attribution_guard).
const ATTRIBUTION_FIELDS = ["domains", "aliases", "plus_slug"] as const;

/** Returns a copy without the attribution fields unless the caller is an admin. */
export const stripAttributionUnlessAdmin = <T extends Record<string, any>>(
  values: T,
  permissions: unknown,
): T => {
  if (permissions === "admin") return values;
  const copy: Record<string, any> = { ...values };
  for (const field of ATTRIBUTION_FIELDS) delete copy[field];
  return copy as T;
};
