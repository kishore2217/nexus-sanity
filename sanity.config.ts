import { AddIcon } from "@sanity/icons/Add";
import { EditIcon } from "@sanity/icons/Edit";
import { EyeOpenIcon } from "@sanity/icons/EyeOpen";
import { TrashIcon } from "@sanity/icons/Trash";
import { visionTool } from "@sanity/vision";
import { defineConfig, type DocumentActionComponent } from "sanity";
import { structureTool, type StructureBuilder } from "sanity/structure";
import {
  docTypes,
  layoutTypeNames,
  nexusTypeNames,
  pageTypeNames,
  schemaTypes,
  STUDIO_PAGE_TYPE,
} from "./schemaTypes";
import { openBulkDelete } from "./components/BulkDelete";
import { DocumentPreview } from "./components/DocumentPreview";
import { StudioLayout } from "./components/StudioLayout";

export default defineConfig({
  name: "default",
  title: "nexus-sanity",

  projectId: "vskzay3h",
  dataset: "production",

  // Offers a reload once CI deploys a new build (e.g. a new page or layout type from Nexus), and
  // hosts the lists' "Select & delete" dialog.
  studio: { components: { layout: StudioLayout } },

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            S.listItem().title("Pages").child(
                // Nexus pages, plus pages created here (one shared type, see schemaTypes/studioPage).
                nexusDocumentList(S, "pages", "Pages", pageTypeNames, STUDIO_PAGE_TYPE),
              ),
            S.listItem()
              .title("Layouts")
              .child(nexusDocumentList(S, "layouts", "Layouts", layoutTypeNames)),
          ]),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
    // Layout and page documents come from the Nexus studio: editors fill them, never create them.
    templates: (templates) => templates.filter((t) => !nexusTypeNames.has(t.schemaType)),
  },

  document: {
    newDocumentOptions: (options) => options.filter((o) => !nexusTypeNames.has(o.templateId)),
    // Duplicating a layout or page document here would create a copy Nexus doesn't know about.
    actions: (actions, { schemaType }) =>
      nexusTypeNames.has(schemaType)
        ? actions
            .filter(({ action }) => action !== "duplicate")
            .map((Action) => (Action.action === "delete" ? alsoInHeaderMenu(Action) : Action))
        : actions,
  },
});

/**
 * One pane listing every document of the given Nexus types. Each type holds a single document
 * (a page has one layout), so listing documents instead of types gives a search bar and opens the
 * document in one click. Nexus creates these documents, so they get no create button.
 *
 * `createType` adds documents of one studio-owned type to the list, with a "New" button for it.
 * The list updates live; the header menu sorts by title or creation time.
 */
function nexusDocumentList(
  S: StructureBuilder,
  id: string,
  title: string,
  types: Set<string>,
  createType?: string,
) {
  const listed = createType ? [...types, createType] : [...types];
  return S.documentList()
    .id(id)
    .title(title)
    .apiVersion("2025-02-19")
    .filter("_type in $types")
    .params({ types: listed })
    .defaultOrdering([{ field: "title", direction: "asc" }])
    .initialValueTemplates(createType ? [S.initialValueTemplateItem(createType)] : [])
    // A new document opens in this list's editor pane rather than somewhere else in the desk.
    .canHandleIntent(
      (intent, params) => intent === "create" && !!createType && params.type === createType,
    )
    .menuItems([
      ...(createType
        ? [
            S.menuItem()
              .title(`New ${S.context.schema.get(createType)?.title ?? createType}`)
              .icon(AddIcon)
              .intent({ type: "create", params: { type: createType, template: createType } })
              .showAsAction(true),
          ]
        : []),
      // Lists select one document at a time; this opens a dialog with checkboxes.
      S.menuItem()
        .title("Select & delete…")
        .icon(TrashIcon)
        .action(() => openBulkDelete({ title, types: listed })),
      S.orderingMenuItem({
        title: "Sort by title",
        name: "titleAsc",
        by: [{ field: "title", direction: "asc" }],
      }),
      S.orderingMenuItem({
        title: "Sort by created (newest first)",
        name: "createdDesc",
        by: [{ field: "_createdAt", direction: "desc" }],
      }),
      S.orderingMenuItem({
        title: "Sort by created (oldest first)",
        name: "createdAsc",
        by: [{ field: "_createdAt", direction: "asc" }],
      }),
    ])
    .child(async (id) => {
      // Known at build time: open the document without a round trip to Sanity.
      const known = docTypes[id];
      if (known) return editor(S).schemaType(known).documentId(id);
      const client = S.context.getClient({ apiVersion: "2025-02-19" });
      // Older URLs (and links built from them) put the type name where the document id goes:
      // /structure/pages/page_blog_da4e69. Each type holds one document, so open that one.
      if (types.has(id)) {
        const docId = await client.fetch<string | null>(`*[_type == $type][0]._id`, { type: id });
        return docId
          ? editor(S).schemaType(id).documentId(docId.replace(/^drafts\./, ""))
          : S.documentTypeList(id);
      }
      // Synced after this build: look its type up. With several types in one list, the editor
      // needs the document's type up front.
      const type = await client.fetch<string | null>(
        `*[_id in [$id, "drafts." + $id]][0]._type`,
        { id },
      );
      if (!type) {
        // Not saved yet: a document just created with the "New" button. Nexus ids never land
        // here (they start with "nexus"), so a missing one still reports as deleted.
        if (createType && !id.startsWith("nexus")) {
          return editor(S).schemaType(createType).documentId(id);
        }
        throw new Error(`Document "${id}" not found. It may have been deleted in Nexus.`);
      }
      return editor(S).schemaType(type).documentId(id);
    });
}

/** A page or layout editor: the form, plus a Preview tab showing its widgets with their content. */
function editor(S: StructureBuilder) {
  return S.document()
    .id("editor")
    .views([
      S.view.form().icon(EditIcon),
      S.view.component(DocumentPreview).id("preview").title("Preview").icon(EyeOpenIcon),
    ]);
}

/** Shows an action in the document header's "⋯" menu as well as the footer menu by Publish. */
function alsoInHeaderMenu(Action: DocumentActionComponent): DocumentActionComponent {
  const Wrapped: DocumentActionComponent = (props) => {
    const description = Action(props);
    return description && { ...description, group: ["default", "paneActions"] };
  };
  Wrapped.action = Action.action;
  Wrapped.displayName = Action.displayName;
  return Wrapped;
}
