import type { SchemaTypeDefinition } from "sanity";
import { docTypes, layoutTypes, pageSubtitles, pageTypes } from "./layouts.generated";
import { createdLabel, subtitle } from "./preview";
import { STUDIO_PAGE_TYPE, studioPageTypes } from "./studioPage";

export { docTypes, STUDIO_PAGE_TYPE };

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

/**
 * Page types list as "<page>" with "Created <date, time> · <layout> (vN) · <widgets>" under it.
 * The date goes first: the widget list can be long and the pane cuts the line off at its end.
 */
const pageTypesWithPreview = pageTypes.map(
  (type) =>
    ({
      ...type,
      preview: {
        select: { title: "title", createdAt: "_createdAt" },
        prepare: ({ title, createdAt }: PreviewSelection) => ({
          title: title || type.title || type.name,
          subtitle: subtitle(createdLabel(createdAt), pageSubtitles[type.name]),
        }),
      },
    }) as SchemaTypeDefinition,
);

// One document type per Nexus layout and per Nexus page, generated before every dev, build and
// deploy, plus the Page type editors create in this studio (see ./studioPage).
export const schemaTypes = [...layoutTypesWithPreview, ...pageTypesWithPreview, ...studioPageTypes];

/** Names of the generated layout types, for the desk structure. */
export const layoutTypeNames = new Set(layoutTypes.map((type) => type.name));

/** Names of the generated page types, for the desk structure. */
export const pageTypeNames = new Set(pageTypes.map((type) => type.name));

/** Every type Nexus owns: editors fill these documents, never create or duplicate them. */
export const nexusTypeNames = new Set([...layoutTypeNames, ...pageTypeNames]);
