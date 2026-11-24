import { DocumentIcon } from "@sanity/icons/Document";
import { defineArrayMember, defineField, defineType, type SchemaTypeDefinition } from "sanity";
import { layoutTypes } from "./layouts.generated";
import { createdLabel, subtitle } from "./preview";

/**
 * Pages editors create in this studio, independent of Nexus: a title, a URL and one attached
 * layout. Unlike Nexus pages (one generated type per page), these share one document type, so a
 * new page needs no rebuild — only a new layout does, since its widgets come from the generated
 * layout types.
 */
export const STUDIO_PAGE_TYPE = "studioPage";

/** The object type that holds a layout's widgets on a studio page: `<layoutType>_content`. */
const toLayoutContentName = (layoutType: string) => `${layoutType}_content`;

/** Fields every generated layout document has; on a page they're the page's own. */
const LAYOUT_DOC_FIELDS = new Set(["title", "slug"]);

type GeneratedType = { name: string; title?: string; fields?: { name: string }[] };

/**
 * One object type per Nexus layout, with the layout's widgets as its fields: the choices for a
 * page's layout. A layout without widgets has nothing to fill in, so it isn't offered.
 */
const layoutContentTypes = (layoutTypes as unknown as GeneratedType[])
  .map((layout) => ({
    name: toLayoutContentName(layout.name),
    title: layout.title ?? layout.name,
    type: "object",
    fields: (layout.fields ?? []).filter((field) => !LAYOUT_DOC_FIELDS.has(field.name)),
    // The attached layout shows by name in the page's Layout field.
    preview: { prepare: () => ({ title: layout.title ?? layout.name, subtitle: "Layout" }) },
  }))
  .filter((type) => type.fields.length > 0);

const layoutTitles: Record<string, string> = Object.fromEntries(
  layoutContentTypes.map((type) => [type.name, type.title]),
);

const studioPage = defineType({
  name: STUDIO_PAGE_TYPE,
  title: "Page",
  type: "document",
  icon: DocumentIcon,
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Page URL",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    // An array of at most one item: Sanity's way to let editors pick one of several object types.
    // Picking another layout means removing this one first, which makes the content loss explicit.
    ...(layoutContentTypes.length > 0
      ? [
          defineField({
            name: "layout",
            title: "Layout",
            description: "The layout this page uses. Add one, then fill in its widgets.",
            type: "array",
            of: layoutContentTypes.map((type) => defineArrayMember({ type: type.name })),
            validation: (rule) => rule.required().min(1).max(1).error("Attach exactly one layout"),
          }),
        ]
      : []),
  ],
  preview: {
    select: { title: "title", createdAt: "_createdAt", layoutType: "layout.0._type" },
    prepare: ({ title, createdAt, layoutType }) => ({
      title: title || "Untitled page",
      subtitle: subtitle(
        createdLabel(createdAt),
        layoutType ? layoutTitles[layoutType] : "No layout attached",
      ),
    }),
  },
});

/** The studio page type and the layout content types it uses. */
export const studioPageTypes = [
  ...(layoutContentTypes as SchemaTypeDefinition[]),
  studioPage,
] as SchemaTypeDefinition[];
