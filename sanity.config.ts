import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { layoutTypeNames, schemaTypes } from "./schemaTypes";

export default defineConfig({
  name: "default",
  title: "nexus-sanity",

  projectId: "vskzay3h",
  dataset: "production",

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Layouts")
          .items([...layoutTypeNames].map((name) => S.documentTypeListItem(name))),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
    // Layout documents come from the Nexus studio: editors fill them, never create them.
    templates: (templates) => templates.filter((t) => !layoutTypeNames.has(t.schemaType)),
  },

  document: {
    newDocumentOptions: (options) => options.filter((o) => !layoutTypeNames.has(o.templateId)),
    // Deleting or duplicating a layout document here would desync it from its Nexus layout.
    actions: (actions, { schemaType }) =>
      layoutTypeNames.has(schemaType)
        ? actions.filter(({ action }) => action !== "delete" && action !== "duplicate")
        : actions,
  },
});
