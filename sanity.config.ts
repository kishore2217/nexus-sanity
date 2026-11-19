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
    // Duplicating a layout document here would create a copy Nexus doesn't know about.
    actions: (actions, { schemaType }) =>
      layoutTypeNames.has(schemaType)
        ? actions.filter(({ action }) => action !== "duplicate")
        : actions,
  },
});
