import { Badge, Box, Card, Flex, Heading, Stack, Text } from "@sanity/ui";
import { useMemo, useState } from "react";
import {
  type ArraySchemaType,
  type ObjectField,
  type ObjectSchemaType,
  type SchemaType,
  useClient,
} from "sanity";
import type { UserViewComponent } from "sanity/structure";

/** Fields every page and layout document has; shown in the preview's header instead. */
const HEADER_FIELDS = new Set(["title", "slug"]);
const IMAGE_URL = /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i;
const IMAGE_NAME = /logo|image|img|icon|avatar|photo|picture|thumbnail|banner/i;

type ImageRef = { projectId: string; dataset: string };

/** True when the type is `name` or extends it (`url` fields, inline `image` fields, …). */
function isType(type: SchemaType | undefined, name: string): boolean {
  for (let t: SchemaType | undefined = type; t; t = t.type) if (t.name === name) return true;
  return false;
}

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value as object).every(([k, v]) => k.startsWith("_") || isEmpty(v)));

/** `image-<id>-<w>x<h>-<ext>` → its CDN URL. */
function imageAssetUrl(ref: string, { projectId, dataset }: ImageRef): string | null {
  const match = /^image-([a-f0-9]+-\d+x\d+)-(\w+)$/.exec(ref);
  return match
    ? `https://cdn.sanity.io/images/${projectId}/${dataset}/${match[1]}.${match[2]}?w=640`
    : null;
}

/** Plain text of Portable Text blocks, one paragraph per block. */
const blockText = (block: { children?: { text?: string }[] }) =>
  (block.children ?? []).map((child) => child.text ?? "").join("");

/**
 * The "Preview" tab of page and layout documents: the document's widgets as cards, filled with
 * what the editor has entered so far (the draft when there is one). Field labels come from the
 * schema, so it fits every generated layout without per-widget code.
 */
export const DocumentPreview: UserViewComponent = ({ document, schemaType }) => {
  const doc = document.displayed as Record<string, unknown>;
  const config = useClient({ apiVersion: "2025-02-19" }).config();
  const images: ImageRef = { projectId: config.projectId ?? "", dataset: config.dataset ?? "" };
  const [showEmpty, setShowEmpty] = useState(false);

  const fields = (schemaType as ObjectSchemaType).fields.filter((f) => !HEADER_FIELDS.has(f.name));
  const slug = (doc.slug as { current?: string } | undefined)?.current;
  const isLayout = schemaType.name.startsWith("layout_");

  return (
    <Box padding={4}>
      <Stack gap={5} style={{ maxWidth: 880, margin: "0 auto" }}>
        <Stack gap={3}>
          <Flex gap={2} align="center" wrap="wrap">
            <Badge tone={isLayout ? "primary" : "positive"}>{isLayout ? "Layout" : "Page"}</Badge>
            {document.draft && <Badge tone="caution">Unpublished changes</Badge>}
          </Flex>
          <Heading size={3}>{(doc.title as string) || "Untitled"}</Heading>
          {slug && !isLayout && (
            <Text size={1} muted>
              /{slug.replace(/^\//, "")}
            </Text>
          )}
          <Flex as="label" gap={2} align="center" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.currentTarget.checked)}
            />
            <Text size={1} muted>
              Show empty fields
            </Text>
          </Flex>
        </Stack>

        <Sections fields={fields} value={doc} images={images} showEmpty={showEmpty} />
      </Stack>
    </Box>
  );
};

type Ctx = { images: ImageRef; showEmpty: boolean };

type Section =
  | { key: string; empty: true }
  | {
      key: string;
      empty?: false;
      label?: string;
      fields: ObjectField[];
      value: Record<string, unknown>;
    };

/**
 * Top level of the document: a studio page's `layout` array and a Nexus page's layout objects are
 * containers, so their widgets become the sections; a layout's widgets are sections already.
 */
function Sections({
  fields,
  value,
  ...ctx
}: { fields: ObjectField[]; value: Record<string, unknown> } & Ctx) {
  const sections = fields.flatMap((field): Section[] => {
    const fieldValue = value[field.name];
    if (field.name === "layout" && isType(field.type, "array")) {
      const item = (fieldValue as Record<string, unknown>[] | undefined)?.[0];
      const itemType = (field.type as ArraySchemaType).of.find((t) => t.name === item?._type);
      if (!item || !itemType) return [{ key: field.name, empty: true }];
      return [
        {
          key: "layout",
          label: itemType.title ?? itemType.name,
          fields: (itemType as ObjectSchemaType).fields,
          value: item,
        },
      ];
    }
    // A Nexus page: every object whose fields are all objects is a layout holding widgets.
    const nested = (field.type as ObjectSchemaType).fields;
    const isContainer =
      nested?.length &&
      nested.every((f) => f.type.jsonType === "object" && !isType(f.type, "image"));
    if (isContainer && field.type.jsonType === "object") {
      return [
        {
          key: field.name,
          label: field.type.title ?? field.name,
          fields: nested,
          value: (fieldValue ?? {}) as Record<string, unknown>,
        },
      ];
    }
    return [{ key: field.name, fields: [field], value }];
  });

  if (sections.length === 0) {
    return (
      <Card padding={4} radius={2} border tone="transparent">
        <Text muted>This document has no widgets to preview.</Text>
      </Card>
    );
  }

  return (
    <Stack gap={5}>
      {sections.map((section) =>
        section.empty ? (
          <Card key={section.key} padding={4} radius={2} border tone="caution">
            <Text size={1}>No layout attached yet. Attach one in the form to preview it.</Text>
          </Card>
        ) : section.label ? (
          <Stack key={section.key} gap={3}>
            <Text
              size={1}
              weight="semibold"
              muted
              style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              {section.label}
            </Text>
            {section.fields.map((widget) => (
              <Widget
                key={widget.name}
                field={widget}
                value={section.value[widget.name]}
                {...ctx}
              />
            ))}
          </Stack>
        ) : (
          section.fields.map((widget) => (
            <Widget key={widget.name} field={widget} value={section.value[widget.name]} {...ctx} />
          ))
        ),
      )}
    </Stack>
  );
}

/** One widget: a card titled with the widget's name, its props inside. */
function Widget({ field, value, ...ctx }: { field: ObjectField; value: unknown } & Ctx) {
  const empty = isEmpty(value);
  return (
    <Card radius={3} border shadow={1} overflow="hidden">
      <Card paddingX={4} paddingY={3} tone="transparent" borderBottom>
        <Flex align="center" justify="space-between" gap={2}>
          <Text size={2} weight="semibold">
            {field.type.title ?? field.name}
          </Text>
          {empty && <Badge>Empty</Badge>}
        </Flex>
      </Card>
      <Box padding={4}>
        {empty && !ctx.showEmpty ? (
          <Text size={1} muted>
            Nothing filled in yet.
          </Text>
        ) : (
          <Value type={field.type} value={value} {...ctx} />
        )}
      </Box>
    </Card>
  );
}

function Value({ type, value, ...ctx }: { type: SchemaType; value: unknown } & Ctx) {
  if (isEmpty(value))
    return (
      <Text size={1} muted>
        —
      </Text>
    );

  if (isType(type, "image")) {
    const ref = (value as { asset?: { _ref?: string } }).asset?._ref;
    const src = ref && imageAssetUrl(ref, ctx.images);
    return src ? (
      <Img src={src} />
    ) : (
      <Text size={1} muted>
        Image
      </Text>
    );
  }

  if (type.jsonType === "object") {
    const fields = (type as ObjectSchemaType).fields ?? [];
    const obj = value as Record<string, unknown>;
    const shown = ctx.showEmpty ? fields : fields.filter((f) => !isEmpty(obj[f.name]));
    return (
      <Stack gap={4}>
        {shown.map((f) => (
          <Prop key={f.name} field={f} value={obj[f.name]} {...ctx} />
        ))}
      </Stack>
    );
  }

  if (type.jsonType === "array") {
    const items = value as Record<string, unknown>[];
    const of = (type as ArraySchemaType).of;
    if (of.some((t) => isType(t, "block"))) {
      return (
        <Stack gap={3}>
          {items.map((block, i) => (
            <Text key={(block._key as string) ?? i} size={2}>
              {typeof block === "object" ? blockText(block as never) : String(block)}
            </Text>
          ))}
        </Stack>
      );
    }
    return (
      <Stack gap={2}>
        {items.map((item, i) => {
          const itemType =
            typeof item === "object" ? (of.find((t) => t.name === item._type) ?? of[0]) : of[0];
          return (
            <Card
              key={(item?._key as string) ?? i}
              padding={3}
              radius={2}
              border
              tone="transparent"
            >
              <Value type={itemType} value={item} {...ctx} />
            </Card>
          );
        })}
      </Stack>
    );
  }

  if (type.jsonType === "boolean") {
    return <Badge tone={value ? "positive" : "default"}>{value ? "Yes" : "No"}</Badge>;
  }

  if (isType(type, "reference")) {
    return (
      <Text size={1} muted>
        → {(value as { _ref?: string })._ref}
      </Text>
    );
  }

  return <Text size={2}>{String(value)}</Text>;
}

/** A widget prop: its label, then its value shown the way the site would roughly show it. */
function Prop({ field, value, ...ctx }: { field: ObjectField; value: unknown } & Ctx) {
  const label = field.type.title ?? field.name;
  const content = (() => {
    if (typeof value === "string" && value) {
      if (isType(field.type, "url") || /^https?:\/\//.test(value)) {
        if (IMAGE_URL.test(value) || IMAGE_NAME.test(field.name)) return <Img src={value} />;
        return (
          <Text size={2}>
            <a href={value} target="_blank" rel="noreferrer">
              {value}
            </a>
          </Text>
        );
      }
      if (field.type.description === "JSON") return <Json text={value} />;
    }
    return <Value type={field.type} value={value} {...ctx} />;
  })();

  return (
    <Stack gap={2}>
      <Text
        size={0}
        weight="semibold"
        muted
        style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
      >
        {label}
      </Text>
      {content}
    </Stack>
  );
}

function Img({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <Text size={1} muted>
        Image couldn&apos;t load: {src}
      </Text>
    );
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      style={{
        maxWidth: "100%",
        maxHeight: 240,
        borderRadius: 4,
        objectFit: "contain",
        alignSelf: "flex-start",
      }}
    />
  );
}

/** JSON props (menus and the like) pretty-printed; invalid JSON is flagged. */
function Json({ text }: { text: string }) {
  const parsed = useMemo(() => {
    try {
      return { ok: true, text: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
      return { ok: false, text };
    }
  }, [text]);
  return (
    <Card
      padding={3}
      radius={2}
      tone={parsed.ok ? "transparent" : "critical"}
      border
      overflow="auto"
    >
      <Stack gap={2}>
        {!parsed.ok && <Text size={1}>Not valid JSON</Text>}
        <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>{parsed.text}</pre>
      </Stack>
    </Card>
  );
}
