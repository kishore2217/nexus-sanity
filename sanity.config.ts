import { visionTool } from "@sanity/vision";
import { defineConfig, type DocumentActionComponent } from "sanity";
import { structureTool, type StructureBuilder } from "sanity/structure";
import {
  docTypes,
  layoutTypeNames,
  nexusTypeNames,
  pageTypeNames,
  schemaTypes,
} from "./schemaTypes";

export default defineConfig({
  name: "default",
  title: "nexus-sanity",

  projectId: "vskzay3h",
  dataset: "production",

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            S.listItem().title("Pages").child(nexusDocumentList(S, "pages", "Pages", pageTypeNames)),
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
 * document in one click. No create button: Nexus creates these documents.
 */
function nexusDocumentList(S: StructureBuilder, id: string, title: string, types: Set<string>) {
  return S.documentList()
    .id(id)
    .title(title)
    .apiVersion("2025-02-19")
    .filter("_type in $types")
    .params({ types: [...types] })
    .defaultOrdering([{ field: "title", direction: "asc" }])
    .initialValueTemplates([])
    .menuItems([])
    .child(async (id) => {
      // Known at build time: open the document without a round trip to Sanity.
      const known = docTypes[id];
      if (known) return S.document().id("editor").schemaType(known).documentId(id);
      const client = S.context.getClient({ apiVersion: "2025-02-19" });
      // Older URLs (and links built from them) put the type name where the document id goes:
      // /structure/pages/page_blog_da4e69. Each type holds one document, so open that one.
      if (types.has(id)) {
        const docId = await client.fetch<string | null>(`*[_type == $type][0]._id`, { type: id });
        return docId
          ? S.document().id("editor").schemaType(id).documentId(docId.replace(/^drafts\./, ""))
          : S.documentTypeList(id);
      }
      // Synced after this build: look its type up. With several types in one list, the editor
      // needs the document's type up front.
      const type = await client.fetch<string | null>(
        `*[_id in [$id, "drafts." + $id]][0]._type`,
        { id },
      );
      if (!type) throw new Error(`Document "${id}" not found. It may have been deleted in Nexus.`);
      return S.document().id("editor").schemaType(type).documentId(id);
    });
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
