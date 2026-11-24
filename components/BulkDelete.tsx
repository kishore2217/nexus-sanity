import {
  Box,
  Button,
  Card,
  Checkbox,
  Dialog,
  Flex,
  Spinner,
  Stack,
  Text,
  TextInput,
} from "@sanity/ui";
import { useToast } from "@sanity/ui/toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClient } from "sanity";
import { createdLabel } from "../schemaTypes/preview";

/**
 * Bulk delete for the desk's document lists. Sanity lists select one document at a time, so a
 * list's menu item opens this dialog (via a window event, since menu actions can't render UI),
 * which lists the same documents with checkboxes.
 */
const OPEN_EVENT = "nexus:bulk-delete";

type OpenDetail = { title: string; types: string[] };
type Row = { _id: string; _type: string; title?: string; _createdAt: string; draft: boolean };

/** For a list's menu item: opens the dialog over the given document types. */
export function openBulkDelete(detail: OpenDetail) {
  window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail }));
}

/** Published id: drafts and published copies of a document are one row. */
const baseId = (id: string) => id.replace(/^drafts\./, "");

/** Mounted once in the studio layout; shows the dialog when a list asks for it. */
export function BulkDeleteHost() {
  const [open, setOpen] = useState<OpenDetail | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => setOpen((event as CustomEvent<OpenDetail>).detail);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  return open ? <BulkDeleteDialog {...open} onClose={() => setOpen(null)} /> : null;
}

function BulkDeleteDialog({ title, types, onClose }: OpenDetail & { onClose: () => void }) {
  const client = useClient({ apiVersion: "2025-02-19" });
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const docs = await client.fetch<Omit<Row, "draft">[]>(
      `*[_type in $types && !(_id in path("versions.**"))]{_id, _type, title, _createdAt}
        | order(lower(title) asc)`,
      { types },
    );
    // One row per document: the published copy when there is one, flagged if only a draft exists.
    const byId = new Map<string, Row>();
    for (const doc of docs) {
      const id = baseId(doc._id);
      const draft = doc._id !== id;
      const existing = byId.get(id);
      if (!existing || (existing.draft && !draft)) byId.set(id, { ...doc, _id: id, draft });
    }
    setRows([...byId.values()]);
  }, [client, types]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => !query || (row.title ?? "").toLowerCase().includes(query));
  }, [rows, search]);

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row._id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of visible) {
        if (allVisibleSelected) next.delete(row._id);
        else next.add(row._id);
      }
      return next;
    });

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      // Published and draft copies, all in one transaction: everything goes or nothing does.
      const tx = client.transaction();
      for (const id of selected) tx.delete(id).delete(`drafts.${id}`);
      await tx.commit({ visibility: "async" });
      toast.push({ status: "success", title: `Deleted ${selected.size} document(s)` });
      onClose();
    } catch (err) {
      // E.g. another document still references one of them.
      setError(err instanceof Error ? err.message : String(err));
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  const count = selected.size;

  return (
    <Dialog
      id="bulk-delete"
      header={`Select & delete: ${title}`}
      width={1}
      onClose={deleting ? undefined : onClose}
      footer={
        <Box padding={3}>
          {confirming ? (
            <Stack gap={3}>
              <Text size={1}>
                Permanently delete {count} document(s), published and draft? This can&apos;t be
                undone here. Documents synced from Nexus come back on its next sync.
              </Text>
              <Flex gap={2} justify="flex-end">
                <Button text="Cancel" mode="ghost" disabled={deleting} onClick={() => setConfirming(false)} />
                <Button text={`Delete ${count}`} tone="critical" loading={deleting} onClick={remove} />
              </Flex>
            </Stack>
          ) : (
            <Flex gap={2} justify="flex-end">
              <Button text="Close" mode="ghost" onClick={onClose} />
              <Button
                text={count > 0 ? `Delete selected (${count})` : "Delete selected"}
                tone="critical"
                disabled={count === 0}
                onClick={() => setConfirming(true)}
              />
            </Flex>
          )}
        </Box>
      }
    >
      <Box padding={4}>
        <Stack gap={3}>
          <TextInput
            placeholder="Search by title"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          {error && (
            <Card padding={3} radius={2} tone="critical">
              <Text size={1}>{error}</Text>
            </Card>
          )}
          {rows === null && !error ? (
            <Flex justify="center" padding={4}>
              <Spinner muted />
            </Flex>
          ) : visible.length === 0 ? (
            <Text size={1} muted>
              Nothing to show.
            </Text>
          ) : (
            <Stack gap={1}>
              <Card as="label" padding={2} radius={2} borderBottom>
                <Flex gap={3} align="center">
                  <Checkbox checked={allVisibleSelected} onChange={toggleAll} />
                  <Text size={1} weight="semibold">
                    Select all ({visible.length})
                  </Text>
                </Flex>
              </Card>
              {visible.map((row) => (
                <Card
                  key={row._id}
                  as="label"
                  padding={2}
                  radius={2}
                  tone={selected.has(row._id) ? "critical" : "default"}
                >
                  <Flex gap={3} align="center">
                    <Checkbox checked={selected.has(row._id)} onChange={() => toggle(row._id)} />
                    <Stack gap={2} flex={1}>
                      <Text size={1} weight="medium" textOverflow="ellipsis">
                        {row.title || "Untitled"}
                      </Text>
                      <Text size={0} muted textOverflow="ellipsis">
                        {[createdLabel(row._createdAt), row.draft ? "Draft only" : undefined]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </Stack>
                  </Flex>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Box>
    </Dialog>
  );
}
