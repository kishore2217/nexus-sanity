/** Helpers for document list previews. */

/** "24 Nov 2026, 10:30" in the editor's locale and time zone. */
const createdFormat = new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"});

export function createdLabel(createdAt?: string): string | undefined {
  return createdAt ? `Created ${createdFormat.format(new Date(createdAt))}` : undefined;
}

/** Joins the non-empty parts of a list preview's subtitle with " · ". */
export function subtitle(...parts: (string | undefined)[]): string | undefined {
  return parts.filter(Boolean).join(" · ") || undefined;
}
