import { layoutTypes, pageTypes } from "./layouts.generated";

// One document type per Nexus layout and per Nexus page, generated before every dev, build and deploy.
export const schemaTypes = [...layoutTypes, ...pageTypes];

/** Names of the generated layout types, for the desk structure. */
export const layoutTypeNames = new Set(layoutTypes.map((type) => type.name));

/** Names of the generated page types, for the desk structure. */
export const pageTypeNames = new Set(pageTypes.map((type) => type.name));

/** Every type Nexus owns: editors fill these documents, never create or duplicate them. */
export const nexusTypeNames = new Set([...layoutTypeNames, ...pageTypeNames]);
