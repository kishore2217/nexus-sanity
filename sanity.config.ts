import { visionTool } from "@sanity/vision";
import { defineConfig, type DocumentActionComponent } from "sanity";
import { structureTool, type StructureBuilder } from "sanity/structure";
import { layoutTypeNames, nexusTypeNames, pageTypeNames, schemaTypes } from "./schemaTypes";

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
    .menuItems([]);
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
