import { layoutTypes } from "./layouts.generated";

// One document type per Nexus layout, generated before every dev, build and deploy.
export const schemaTypes = [...layoutTypes];

/** Names of the generated layout types, for the desk structure and document rules. */
export const layoutTypeNames = new Set(layoutTypes.map((type) => type.name));
