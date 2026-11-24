import type { SchemaTypeDefinition } from "sanity";
import { docTypes, layoutTypes, pageSubtitles, pageTypes } from "./layouts.generated";

export { docTypes };

/** "24 Nov 2026, 10:30" in the editor's locale and time zone. */
const createdFormat = new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"});

function createdLabel(createdAt?: string): string | undefined {
  return createdAt ? `Created ${createdFormat.format(new Date(createdAt))}` : undefined;
}

/** Joins the non-empty parts of a list preview's subtitle with " · ". */
function subtitle(...parts: (string | undefined)[]): string | undefined {
  return parts.filter(Boolean).join(" · ") || undefined;
}

type PreviewSelection = { title?: string; createdAt?: string };

/** Layout types list as "<layout>" with "Created <date, time>" under it. */
const layoutTypesWithPreview = layoutTypes.map(
  (type) =>
    ({
      ...type,
      preview: {
        select: { title: "title", createdAt: "_createdAt" },
        prepare: ({ title, createdAt }: PreviewSelection) => ({
          title: title || type.title || type.name,
          subtitle: createdLabel(createdAt),
        }),
      },
    }) as SchemaTypeDefinition,
);

/** Page types list as "<page>" with "<layout> (vN) · <widgets> · Created <date, time>" under it. */
const pageTypesWithPreview = pageTypes.map(
  (type) =>
    ({
      ...type,
      preview: {
        select: { title: "title", createdAt: "_createdAt" },
        prepare: ({ title, createdAt }: PreviewSelection) => ({
          title: title || type.title || type.name,
          subtitle: subtitle(pageSubtitles[type.name], createdLabel(createdAt)),
        }),
      },
    }) as SchemaTypeDefinition,
);

// One document type per Nexus layout and per Nexus page, generated before every dev, build and deploy.
export const schemaTypes = [...layoutTypesWithPreview, ...pageTypesWithPreview];

/** Names of the generated layout types, for the desk structure. */
export const layoutTypeNames = new Set(layoutTypes.map((type) => type.name));

/** Names of the generated page types, for the desk structure. */
export const pageTypeNames = new Set(pageTypes.map((type) => type.name));

/** Every type Nexus owns: editors fill these documents, never create or duplicate them. */
export const nexusTypeNames = new Set([...layoutTypeNames, ...pageTypeNames]);
