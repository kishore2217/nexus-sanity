import { Button, Card, Flex, Radio, Select, Stack, Text } from "@sanity/ui";
import { useId, useState } from "react";
import {
  type ArrayOfObjectsInputProps,
  type ObjectSchemaType,
  set,
  useClient,
} from "sanity";

/** A layout choice's object type on a page: `<layoutType>_content` (see schemaTypes/studioPage). */
const CONTENT_SUFFIX = "_content";

type Start = "copy" | "empty";

/**
 * The layout's content as filled in under Layouts: its published document, else its draft. Only
 * the widget fields the page's layout type has are kept, so system fields and the layout's own
 * title and URL stay behind.
 */
async function fetchLayoutContent(
  client: ReturnType<typeof useClient>,
  contentType: ObjectSchemaType,
): Promise<Record<string, unknown>> {
  const layoutType = contentType.name.slice(0, -CONTENT_SUFFIX.length);
  const doc = await client.fetch<Record<string, unknown> | null>(
    `coalesce(
      *[_type == $type && !(_id in path("drafts.**"))] | order(_updatedAt desc)[0],
      *[_type == $type] | order(_updatedAt desc)[0]
    )`,
    { type: layoutType },
  );
  if (!doc) return {};
  const widgetNames = new Set(contentType.fields.map((field) => field.name));
  return Object.fromEntries(Object.entries(doc).filter(([name]) => widgetNames.has(name)));
}

/**
 * Input for a studio page's Layout field (an array holding at most one layout). Attaching a layout
 * asks whether to start from the content already filled in for that layout under Layouts, or
 * empty. Once attached, the layout's widgets are edited as usual; "Change layout" swaps it.
 */
export function LayoutPickerInput(props: ArrayOfObjectsInputProps) {
  const { value, onChange, renderDefault, schemaType, readOnly } = props;
  const client = useClient({ apiVersion: "2025-02-19" });
  const choices = schemaType.of as ObjectSchemaType[];
  const attached = (value?.length ?? 0) > 0;

  // Changing an attached layout; with none attached the picker always shows (also after the
  // editor removes the layout through its item menu).
  const [changing, setChanging] = useState(false);
  const picking = !attached || changing;
  const [typeName, setTypeName] = useState(choices[0]?.name ?? "");
  const [start, setStart] = useState<Start>("copy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const radioName = useId();

  const attach = async () => {
    const contentType = choices.find((type) => type.name === typeName);
    if (!contentType) return;
    setBusy(true);
    setError(null);
    try {
      const content = start === "copy" ? await fetchLayoutContent(client, contentType) : {};
      const key = Math.random().toString(36).slice(2, 14);
      onChange(set([{ _type: contentType.name, _key: key, ...content }]));
      setChanging(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (choices.length === 0) {
    return (
      <Card padding={3} radius={2} tone="caution" border>
        <Text size={1}>No layouts with widgets yet. Create one in Nexus first.</Text>
      </Card>
    );
  }

  if (!picking || readOnly) {
    return (
      <Stack gap={3}>
        {renderDefault(props)}
        {attached && !readOnly && (
          <Flex>
            <Button
              text="Change layout…"
              mode="ghost"
              fontSize={1}
              padding={2}
              onClick={() => setChanging(true)}
            />
          </Flex>
        )}
      </Stack>
    );
  }

  return (
    <Card padding={3} radius={2} border>
      <Stack gap={4}>
        <Stack gap={2}>
          <Text size={1} weight="semibold">
            Layout
          </Text>
          <Select value={typeName} onChange={(e) => setTypeName(e.currentTarget.value)}>
            {choices.map((type) => (
              <option key={type.name} value={type.name}>
                {type.title ?? type.name}
              </option>
            ))}
          </Select>
        </Stack>

        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Content
          </Text>
          <Flex as="label" gap={2} align="center">
            <Radio
              name={radioName}
              checked={start === "copy"}
              onChange={() => setStart("copy")}
            />
            <Text size={1}>Keep the layout&apos;s existing content (from Layouts)</Text>
          </Flex>
          <Flex as="label" gap={2} align="center">
            <Radio
              name={radioName}
              checked={start === "empty"}
              onChange={() => setStart("empty")}
            />
            <Text size={1}>Start with an empty layout</Text>
          </Flex>
          <Text size={1} muted>
            Either way the page gets its own copy: later edits under Layouts don&apos;t change it.
          </Text>
        </Stack>

        {attached && (
          <Card padding={3} radius={2} tone="caution">
            <Text size={1}>Attaching replaces this page&apos;s current layout and its content.</Text>
          </Card>
        )}
        {error && (
          <Card padding={3} radius={2} tone="critical">
            <Text size={1}>Couldn&apos;t load the layout&apos;s content: {error}</Text>
          </Card>
        )}

        <Flex gap={2}>
          <Button
            text={attached ? "Replace layout" : "Attach layout"}
            tone="primary"
            loading={busy}
            disabled={!typeName}
            onClick={attach}
          />
          {attached && <Button text="Cancel" mode="ghost" onClick={() => setChanging(false)} />}
        </Flex>
      </Stack>
    </Card>
  );
}
