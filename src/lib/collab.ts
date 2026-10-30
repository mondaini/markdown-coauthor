// Shared documents: Yjs synced over Supabase Realtime broadcast, saved as an append-only
// log of updates in Postgres (supabase/migrations/0001_doc_updates.sql).
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseProvider } from "@supabase-labs/y-supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Without Supabase settings the app still runs, single-user and unsaved. */
export const collabEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

const TABLE = "doc_updates";
const FROM_DB = "db"; // origin of updates loaded from the database, so they aren't saved again
const REMOTE = "remote"; // origin y-supabase gives updates from other clients
const FLUSH_MS = 500;
const COLORS = ["#2563eb", "#db2777", "#16a34a", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04", "#dc2626"];

let client: SupabaseClient | null = null;
const supabase = () => (client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!));

export type SharedDoc = {
  text: Y.Text;
  meta: Y.Map<unknown>;
  awareness: Awareness;
  /** True when the doc was empty in the database (a brand-new document). */
  empty: boolean;
  destroy(): void;
};

/** Set by the root page in the browser that creates a document; only that tab seeds it. */
export const seedKey = (docId: string) => `coauthor.seed.${docId}`;

/** 16 random bytes, base64url: unguessable, and valid for the doc_id check in the table. */
export function newDocId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function setPresence(awareness: Awareness) {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const name = `Guest ${String(Math.floor(Math.random() * 9000) + 1000)}`;
  awareness.setLocalStateField("user", { name, color, colorLight: `${color}33` });
}

export async function openDoc(id: string): Promise<SharedDoc> {
  const ydoc = new Y.Doc();
  const awareness = new Awareness(ydoc);
  setPresence(awareness);
  const base = { text: ydoc.getText("doc"), meta: ydoc.getMap("meta"), awareness };

  if (!collabEnabled) {
    return { ...base, empty: true, destroy: () => ydoc.destroy() };
  }

  // Load before connecting, so the provider doesn't rebroadcast what we just read.
  // The table has no read access; this function returns one document's rows given its id.
  const { data, error } = await supabase().rpc("doc_updates_for", { p_doc_id: id });
  if (error) throw new Error(`Could not load document: ${error.message}`);
  const rows = (data ?? []) as string[];
  if (rows.length) Y.applyUpdate(ydoc, Y.mergeUpdates(rows.map(fromBase64)), FROM_DB);

  // Each client saves only its own edits, so every update is stored once.
  // ponytail: an edit made in the last FLUSH_MS before the tab dies may be lost if the keepalive send fails.
  let pending: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const take = () => {
    if (!pending.length) return null;
    const merged = pending.length === 1 ? pending[0] : Y.mergeUpdates(pending);
    pending = [];
    return toBase64(merged);
  };
  const flush = async () => {
    timer = null;
    const update = take();
    if (!update) return;
    const { error } = await supabase().from(TABLE).insert({ doc_id: id, update });
    if (error) {
      console.error("collab: save failed", error);
      if (error.code === "23514") return; // check constraint (e.g. too large): retrying won't help
      pending.unshift(fromBase64(update));
      timer ??= setTimeout(flush, FLUSH_MS * 4);
    }
  };
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE || origin === FROM_DB) return;
    pending.push(update);
    timer ??= setTimeout(flush, FLUSH_MS);
  };
  // On tab close a normal request may be cancelled; keepalive lets the last save finish.
  const flushOnHide = () => {
    const update = take();
    if (!update) return;
    void fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ doc_id: id, update }),
    });
  };
  ydoc.on("update", onUpdate);
  window.addEventListener("pagehide", flushOnHide);

  const provider = new SupabaseProvider(`doc:${id}`, ydoc, supabase(), { awareness });
  // y-supabase only sends our presence when it changes, so someone who joins later wouldn't see us
  // until we moved. Answer each newcomer by re-sending our state.
  awareness.on("change", ({ added }: { added: number[] }, origin: unknown) => {
    if (origin === REMOTE && added.length) awareness.setLocalState(awareness.getLocalState());
  });

  return {
    ...base,
    empty: rows.length === 0,
    destroy() {
      window.removeEventListener("pagehide", flushOnHide);
      if (timer) clearTimeout(timer);
      void flush();
      provider.destroy();
      ydoc.off("update", onUpdate);
      ydoc.destroy();
    },
  };
}
