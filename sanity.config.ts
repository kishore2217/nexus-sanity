import { visionTool } from "@sanity/vision";
import { defineConfig, type DocumentActionComponent } from "sanity";
import { structureTool } from "sanity/structure";
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
            S.listItem()
              .title("Pages")
              .child(
                S.list()
                  .title("Pages")
                  .items([...pageTypeNames].map((name) => S.documentTypeListItem(name))),
              ),
            S.listItem()
              .title("Layouts")
              // Each layout type holds one document, so list the documents themselves: one pane
              // with a search bar, and a click opens the layout's document directly.
              .child(
                S.documentList()
                  .id("layouts")
                  .title("Layouts")
                  .apiVersion("2025-02-19")
                  .filter("_type in $types")
                  .params({ types: [...layoutTypeNames] })
                  .defaultOrdering([{ field: "title", direction: "asc" }])
                  .initialValueTemplates([])
                  .menuItems([]),
              ),
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
