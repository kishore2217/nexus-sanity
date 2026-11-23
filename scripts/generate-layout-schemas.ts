/**
 * Generates the Studio's schema from the layouts and pages the Nexus studio sync wrote to Sanity.
 *
 * Every Nexus layout is its own document type. On Submit, the sync saves the layout's schema in a
 * `nexusLayoutType` document (type name, and one object field per widget with its prop fields).
 *
 * Every Nexus page is its own document type too. When a page is created (or its layout or layout
 * version changes), the sync saves its schema in a `nexusPageType` document: Page → Layouts →
 * Widgets, i.e. one object field per layout, holding one object field per widget.
 *
 * This script reads both and writes `schemaTypes/layouts.generated.ts` (`layoutTypes`, `pageTypes`).
 *
 * Runs before `dev`, `build` and `deploy` (see package.json), as the signed-in Sanity user:
 *   sanity exec scripts/generate-layout-schemas.ts --with-user-token
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCliClient } from "sanity/cli";

type StoredField = {
  name: string;
  type: string;
  title?: string;
  options?: { list?: { title: string; value: string }[] };
  nexusJson?: boolean;
};
type StoredWidget = { fieldName: string; title?: string; fields?: StoredField[] };
type StoredLayout = { layoutId?: string; typeName: string; title?: string; widgets?: StoredWidget[] };
type StoredPageLayout = {
  fieldName: string;
  title?: string;
  versionNumber?: number;
  widgets?: StoredWidget[];
};
type StoredPage = {
  pageId?: string;
  typeName: string;
  title?: string;
  layouts?: StoredPageLayout[];
};

const OUTPUT = resolve(process.cwd(), "schemaTypes/layouts.generated.ts");
const JSON_ROWS = 6;

/** Field types the generator can emit as-is. Anything else would break the whole Studio schema. */
const SUPPORTED_FIELD_TYPES = new Set([
  "string", "text", "number", "boolean", "date", "datetime", "url", "image", "file", "slug",
]);
/** Sanity type and field names: a letter or underscore, then letters, digits or underscores. */
const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Keeps items with a valid, unique name and warns about the rest. One bad or duplicate name in
 * Sanity data would otherwise stop the Studio from loading for everyone.
 */
function validNamed<T>(items: T[] | undefined, nameOf: (item: T) => unknown, where: string): T[] {
  const seen = new Set<string>();
  return (items ?? []).filter((item) => {
    const name = nameOf(item);
    if (typeof name !== "string" || !VALID_NAME.test(name)) {
      console.warn(`Skipping ${where}: invalid name ${JSON.stringify(name)}`);
      return false;
    }
    if (seen.has(name)) {
      console.warn(`Skipping ${where}: duplicate name "${name}"`);
      return false;
    }
    seen.add(name);
    return true;
  });
}

/** "New page layout1 (v2)": a page layout's title with its version. */
function layoutLabel(layout: StoredPageLayout): string {
  const title = layout.title ?? layout.fieldName;
  return layout.versionNumber ? `${title} (v${layout.versionNumber})` : title;
}

const QUERY = `{
  "layouts": *[_type == "nexusLayoutType" && !(_id in path("drafts.**"))]
    | order(title asc){layoutId, typeName, title, widgets},
  "pages": *[_type == "nexusPageType" && !(_id in path("drafts.**"))]
    | order(title asc){pageId, typeName, title, layouts}
}`;

/** Same rule as the Nexus sync (`toIdPart`): characters outside `[A-Za-z0-9_-]` become `_`. */
const toIdPart = (value: string) => value.trim().replace(/[^\w-]/g, "_").slice(0, 100);

/** Content document id → its type, so the desk opens a document without querying for its type. */
function toDocTypes(layouts: StoredLayout[], pages: StoredPage[]): Record<string, string> {
  const entries = [
    ...layouts.map((l) => [l.layoutId && `nexusLayout-${toIdPart(l.layoutId)}`, l.typeName]),
    ...pages.map((p) => [p.pageId && `nexusPage-${toIdPart(p.pageId)}`, p.typeName]),
  ];
  return Object.fromEntries(entries.filter(([id]) => id));
}

function toField(field: StoredField) {
  return {
    name: field.name,
    title: field.title ?? field.name,
    type: field.type,
    ...(field.options?.list?.length && { options: { list: field.options.list } }),
    ...(field.nexusJson && { description: "JSON", rows: JSON_ROWS }),
  };
}

/** Fields Sanity can render: a valid, unique name and a supported type. */
function toFields(fields: StoredField[] | undefined, where: string) {
  return validNamed(fields, (f) => f.name, `field in ${where}`)
    .filter((field) => {
      if (SUPPORTED_FIELD_TYPES.has(field.type)) return true;
      console.warn(`Skipping field "${field.name}" in ${where}: unsupported type "${field.type}"`);
      return false;
    })
    .map(toField);
}

/** One object field per widget. An object needs a field: widgets without props are skipped. */
function toWidgetFields(widgets: StoredWidget[] | undefined, where: string) {
  return validNamed(widgets, (w) => w.fieldName, `widget in ${where}`)
    .map((widget) => ({
      name: widget.fieldName,
      title: widget.title ?? widget.fieldName,
      type: "object",
      options: { collapsible: true, collapsed: false },
      fields: toFields(widget.fields, `${where} › ${widget.fieldName}`),
    }))
    .filter((widget) => widget.fields.length > 0);
}

function toDocumentType(layout: StoredLayout) {
  return {
    name: layout.typeName,
    title: layout.title ?? layout.typeName,
    type: "document",
    fields: [
      { name: "title", title: "Title", type: "string", readOnly: true },
      { name: "slug", title: "Layout id", type: "slug", readOnly: true, hidden: true },
      ...toWidgetFields(layout.widgets, layout.typeName),
    ],
  };
}

/** Page → one object field per layout → one object field per widget. */
function toPageDocumentType(page: StoredPage) {
  const layouts = validNamed(page.layouts, (l) => l.fieldName, `layout in ${page.typeName}`)
    .map((layout) => ({
      layout,
      widgets: toWidgetFields(layout.widgets, `${page.typeName} › ${layout.fieldName}`),
    }))
    .filter(({ widgets }) => widgets.length > 0);
  return {
    name: page.typeName,
    title: page.title ?? page.typeName,
    type: "document",
    fields: [
      { name: "title", title: "Title", type: "string", readOnly: true },
      { name: "slug", title: "Page URL", type: "slug", readOnly: true },
      ...layouts.map(({ layout, widgets }) => ({
        name: layout.fieldName,
        title: layoutLabel(layout),
        type: "object",
        options: { collapsible: true, collapsed: false },
        fields: widgets,
      })),
    ],
  };
}

/** "New page layout1 (v2) · All Type, All Type 2" for a page's list preview. */
function toPageSubtitle(page: StoredPage): string {
  return (page.layouts ?? [])
    .map((layout) => {
      const name = layoutLabel(layout);
      const widgets = (layout.widgets ?? []).map((w) => w.title ?? w.fieldName).join(", ");
      return widgets ? `${name} · ${widgets}` : name;
    })
    .join(" | ");
}

async function main() {
  const client = getCliClient({ apiVersion: "2025-02-19" });
  const result = await client.fetch<{ layouts: StoredLayout[]; pages: StoredPage[] }>(QUERY);
  const layouts = validNamed(result.layouts, (l) => l.typeName, "layout type");
  // Layout and page types share one schema namespace, so a page can't reuse a layout's name.
  const layoutNames = new Set(layouts.map((l) => l.typeName));
  const pages = validNamed(result.pages, (p) => p.typeName, "page type").filter((page) => {
    if (!layoutNames.has(page.typeName)) return true;
    console.warn(`Skipping page type: name "${page.typeName}" is already a layout type`);
    return false;
  });
  const layoutTypes = layouts.map(toDocumentType);
  const pageTypes = pages.map(toPageDocumentType);
  const pageSubtitles = Object.fromEntries(pages.map((p) => [p.typeName, toPageSubtitle(p)]));
  const docTypes = toDocTypes(layouts, pages);

  const source = [
    "// Generated by scripts/generate-layout-schemas.ts. Do not edit: run `npm run generate`.",
    "import type {SchemaTypeDefinition} from 'sanity'",
    "",
    `export const layoutTypes = ${JSON.stringify(layoutTypes, null, 2)} as SchemaTypeDefinition[]`,
    "",
    `export const pageTypes = ${JSON.stringify(pageTypes, null, 2)} as SchemaTypeDefinition[]`,
    "",
    "/** Per page type: its layout and widgets, shown under the page in document lists. */",
    `export const pageSubtitles: Record<string, string> = ${JSON.stringify(pageSubtitles, null, 2)}`,
    "",
    "/** Content document id → its type: the desk opens documents without a type lookup. */",
    `export const docTypes: Record<string, string> = ${JSON.stringify(docTypes, null, 2)}`,
    "",
  ].join("\n");
  // Unchanged output: skip the write so `sanity dev` doesn't hot-reload for nothing.
  if (!existsSync(OUTPUT) || readFileSync(OUTPUT, "utf8") !== source) writeFileSync(OUTPUT, source);
  const names = (types: { name: string }[]) => types.map((t) => t.name).join(", ");
  console.log(`Generated ${layoutTypes.length} layout type(s): ${names(layoutTypes)}`);
  console.log(`Generated ${pageTypes.length} page type(s): ${names(pageTypes)}`);
}

main().catch((error) => {
  console.error("Could not generate layout schemas:", error);
  process.exit(1);
});
