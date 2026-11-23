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
            S.listItem()
              .title("Pages")
              .child(
                S.list()
                  .title("Pages")
                  .items([...pageTypeNames].map((name) => S.documentTypeListItem(name))),
              ),
            S.listItem()
              .title("Layouts")
              .child(
                S.list()
                  .title("Layouts")
                  .items([...layoutTypeNames].map((name) => singleDocumentItem(S, name))),
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

/**
 * A Nexus layout type holds exactly one document, so its list item opens that document directly
 * instead of a one-row document list. Falls back to the list if the document doesn't exist yet.
 */
function singleDocumentItem(S: StructureBuilder, typeName: string) {
  return S.listItem()
    .id(typeName)
    .title(S.context.schema.get(typeName)?.title ?? typeName)
    .schemaType(typeName)
    .child(async () => {
      const client = S.context.getClient({ apiVersion: "2025-02-19" });
      const id = await client.fetch<string | null>(
        `*[_type == $type] | order(_updatedAt desc)[0]._id`,
        { type: typeName },
        { perspective: "raw" },
      );
      if (!id) return S.documentTypeList(typeName);
      const publishedId = id.replace(/^(drafts\.|versions\.[^.]+\.)/, "");
      return S.document().schemaType(typeName).documentId(publishedId);
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
