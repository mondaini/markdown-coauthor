"use client";

import { useEffect, useRef, useState } from "react";
import AiBar, { type Mode } from "@/components/AiBar";
import Editor, { type Anchors, type EditorHandle, type Range } from "@/components/Editor";
import Preview from "@/components/Preview";
import { collabEnabled, openDoc, seedKey, type SharedDoc } from "@/lib/collab";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  LOCALE_STORAGE_KEY,
  messages,
  readLocale,
  translateInstruction,
  type Locale,
  type Messages,
} from "@/lib/i18n";
import { DEFAULT_MODEL, MODELS, type ModelId } from "@/lib/models";
import type { Budget } from "@/lib/openrouter";
import type { HistoryStep } from "@/lib/prompt";
import { SAMPLE_DOC } from "@/lib/sample";

/**
 * A suggestion under review. It lives only in this browser: the review editor shows it over a snapshot,
 * and only the accepted result is written to the shared document.
 */
type Review = {
  id: number;
  /** Shared doc at request time, and the target range in it. */
  snapshot: string;
  range: Range;
  /** null = the whole document */
  selection: Range | null;
  /** The target pinned to the shared text, and what it said at request time. */
  anchors: Anchors;
  expected: string;
  history: HistoryStep[];
  proposal: { range: Range; text: string };
  changeCount: number;
  /** Set when this review is a translation of the whole document. */
  translateTo: Locale | null;
};

type BudgetState = Budget | { mock: true } | { noKey: true } | null;

type Notice =
  | null
  | { kind: "nothing" }
  | { kind: "generic" }
  | { kind: "changed" }
  | { kind: "http"; status: number; error?: string; remaining?: number; translating?: boolean };

function noticeText(notice: Notice, copy: Messages): string | null {
  if (!notice) return null;
  if (notice.kind === "nothing") return copy.nothing;
  if (notice.kind === "generic") return copy.generic;
  if (notice.kind === "changed") return copy.textChanged;
  if (notice.error === "document_too_long") return notice.translating ? copy.translationTooLong : copy.documentTooLong;
  if (notice.error === "missing_key") return copy.missingKey;
  if (notice.error === "budget_exhausted") return copy.budgetExhausted(`$${(notice.remaining ?? 0).toFixed(2)}`);
  if (notice.error === "invalid_request") return copy.invalidRequest;
  if (notice.error === "upstream_error") return copy.upstreamError;
  return copy.requestFailed(notice.status);
}

/** Whitespace words, plus one unit per Han character so a Chinese selection is not "1 word". */
function countUnits(text: string) {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const rest = text.replace(/\p{Script=Han}/gu, " ").split(/\s+/).filter(Boolean).length;
  return han + rest;
}

const usd = (n: number) => `$${n.toFixed(4)}`;

const metaLocale = (meta: SharedDoc["meta"]): Locale => {
  const value = meta.get("locale");
  return isLocale(value) ? value : DEFAULT_LOCALE;
};

function takeSeed(docId: string) {
  try {
    const seed = sessionStorage.getItem(seedKey(docId));
    sessionStorage.removeItem(seedKey(docId));
    return seed;
  } catch {
    return null;
  }
}

async function fetchBudget(): Promise<BudgetState> {
  try {
    const res = await fetch("/api/budget");
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export default function App({ docId }: { docId: string }) {
  const editor = useRef<EditorHandle>(null);
  const reviewEditor = useRef<EditorHandle>(null);
  const [shared, setShared] = useState<SharedDoc | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(1);
  const [doc, setDoc] = useState("");
  /** What the review editor shows, so the preview follows the suggestion under review. */
  const [reviewDoc, setReviewDoc] = useState("");
  const [selection, setSelection] = useState<Range>({ from: 0, to: 0 });
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [locale, setLocale] = useState<Locale>(readLocale);
  const [docLocale, setDocLocale] = useState<Locale>(DEFAULT_LOCALE);
  /** Language of an in-flight translation request; shown in the select until the request settles. */
  const [translateTo, setTranslateTo] = useState<Locale | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [spend, setSpend] = useState({ last: 0, total: 0 });
  const [budget, setBudget] = useState<BudgetState>(null);
  /** "locale\0translated text" -> the text it was translated from, so translating back restores the original for free. */
  const originals = useRef(new Map<string, string>());
  const reviewIds = useRef(0);
  const copy = messages[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.product;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Preference simply won't persist.
    }
  }, [locale, copy.product]);

  useEffect(() => {
    fetchBudget().then(setBudget);
  }, []);

  // Open the shared document; a brand-new one is seeded by the browser that created it.
  useEffect(() => {
    let opened: SharedDoc | null = null;
    let cancelled = false;
    openDoc(docId).then(
      (sd) => {
        if (cancelled) return sd.destroy();
        opened = sd;
        const seed = takeSeed(docId);
        // Without Supabase nothing is saved, so every load starts from the seed or the sample.
        if (sd.empty && (seed !== null || !collabEnabled)) sd.text.insert(0, seed ?? SAMPLE_DOC);
        setDoc(sd.text.toString());
        setDocLocale(metaLocale(sd.meta));
        setShared(sd);
      },
      (error) => {
        console.error(error);
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [docId]);

  // The document language and who is here come from the shared document.
  useEffect(() => {
    if (!shared) return;
    const onMeta = () => setDocLocale(metaLocale(shared.meta));
    const onPresence = () => setEditing(shared.awareness.getStates().size);
    shared.meta.observe(onMeta);
    shared.awareness.on("change", onPresence);
    return () => {
      shared.meta.unobserve(onMeta);
      shared.awareness.off("change", onPresence);
    };
  }, [shared]);

  async function run(instruction: string, options?: { translateTo?: Locale }) {
    const ed = editor.current;
    if (!ed || mode === "loading") return;
    const translating = options?.translateTo != null;
    const refining = !translating && review !== null;

    // A refine works on the reviewed snapshot; anything else starts from the shared text as it is now.
    const snapshot = refining ? review!.snapshot : ed.getDoc();
    const target = translating ? null : refining ? review!.selection : selection.from === selection.to ? null : selection;
    const range = target ?? { from: 0, to: snapshot.length };
    const anchors = refining ? review!.anchors : ed.anchor(range);
    const expected = refining ? review!.expected : snapshot.slice(range.from, range.to);
    const history = refining ? review!.history : [];
    const original = translating ? originals.current.get(`${options.translateTo}\0${snapshot}`) : undefined;

    if (translating) setTranslateTo(options.translateTo!);
    setMode("loading");
    setNotice(null);
    try {
      const res =
        original === undefined
          ? await fetch("/api/suggest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ document: snapshot, selection: target, instruction, model, history }),
            })
          : null;
      const data = res ? await res.json() : { text: original, cost: 0 };
      if (res && !res.ok) {
        setNotice({
          kind: "http",
          status: res.status,
          error: typeof data?.error === "string" ? data.error : undefined,
          remaining: typeof data?.remaining === "number" ? data.remaining : undefined,
          translating,
        });
        throw new Error("request");
      }

      setSpend((s) => ({ last: data.cost, total: s.total + data.cost }));
      if (res) fetchBudget().then(setBudget);
      const text: string = data.text;
      if (translating && text !== snapshot) originals.current.set(`${docLocale}\0${text}`, snapshot);

      // A collaborator may have changed the target while the co-author was working.
      if (ed.read(anchors) !== expected) {
        setNotice({ kind: "changed" });
        setReview(null);
      } else if (text === expected) {
        setNotice({ kind: "nothing" });
        if (!refining) setReview(null);
      } else {
        setReview({
          id: refining ? review!.id : ++reviewIds.current,
          snapshot,
          range,
          selection: target,
          anchors,
          expected,
          history: [...history, { instruction, proposal: text }],
          proposal: { range, text },
          changeCount: 0,
          translateTo: options?.translateTo ?? null,
        });
      }
    } catch {
      // A failed request leaves any open review exactly as it was.
      setNotice((current) => current ?? { kind: "generic" });
    } finally {
      setTranslateTo(null);
      setMode("idle");
    }
  }

  /** Write the reviewed result to the shared document, unless someone changed that text meanwhile. */
  function finish(action?: "acceptAll" | "rejectAll") {
    const r = review;
    const ed = reviewEditor.current;
    if (!r || !ed) return;
    if (action) ed[action]();
    const final = ed.getDoc();
    const replacement = final.slice(r.range.from, r.range.to + final.length - r.snapshot.length);
    if (replacement !== r.expected) {
      if (!editor.current?.replaceIfUnchanged(r.anchors, r.expected, replacement)) setNotice({ kind: "changed" });
      else if (r.translateTo) shared?.meta.set("locale", r.translateTo);
    }
    setReview(null);
  }

  function onChunks(count: number) {
    if (count === 0) finish();
    else setReview((r) => (r ? { ...r, changeCount: count } : r));
  }

  function onDocumentLanguage(value: string) {
    if (!isLocale(value) || mode === "loading") return;
    if (value === (review?.translateTo ?? docLocale)) return;
    if (value === docLocale && review?.translateTo) {
      finish("rejectAll");
      return;
    }
    void run(translateInstruction(value), { translateTo: value });
  }

  if (loadFailed) return <p className="p-5 text-sm text-red-700">{copy.loadFailed}</p>;
  if (!shared) return <p className="p-5 text-sm text-neutral-500">{copy.loadingDoc}</p>;

  const selectionWords =
    selection.from !== selection.to
      ? countUnits(doc.slice(selection.from, selection.to))
      : 0;

  const budgetLabel =
    budget === null
      ? ""
      : "mock" in budget
        ? copy.mock
        : "noKey" in budget
          ? copy.noKey
          : budget.remaining !== null && budget.limit !== null
          ? copy.budgetLeft(`$${budget.remaining.toFixed(2)}`, `$${budget.limit.toFixed(2)}`)
          : copy.keyUsage(`$${budget.usage.toFixed(2)}`);

  const chunkLabels = { accept: copy.acceptChunk, reject: copy.rejectChunk };

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-900">
      <header className="flex items-start gap-4 border-b border-neutral-200 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">{copy.product}</h1>
          <p className="text-sm text-neutral-500">{copy.tagline}</p>
        </div>
        <span className="shrink-0 self-center text-xs text-neutral-500" data-testid="presence">
          {collabEnabled ? copy.editing(editing) : copy.collabOff}
        </span>
        <select
          aria-label={copy.language}
          value={locale}
          onChange={(event) => {
            if (isLocale(event.target.value)) setLocale(event.target.value);
          }}
          className="shrink-0 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
        >
          {LOCALES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </header>

      <AiBar
        mode={review && mode === "idle" ? "reviewing" : mode}
        selectionWords={selectionWords}
        changeCount={review?.changeCount ?? 0}
        model={model}
        copy={copy}
        error={noticeText(notice, copy)}
        onModelChange={setModel}
        onRun={run}
        onAcceptAll={() => finish("acceptAll")}
        onRejectAll={() => finish("rejectAll")}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <section className="flex min-h-0 flex-col overflow-hidden border-r border-neutral-200">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-1.5">
            <label htmlFor="doc-language" className="text-xs font-medium text-neutral-500">
              {copy.documentLanguage}
            </label>
            <select
              id="doc-language"
              aria-label={copy.documentLanguage}
              title={copy.documentLanguageHint}
              value={translateTo ?? review?.translateTo ?? docLocale}
              disabled={mode === "loading"}
              onChange={(event) => onDocumentLanguage(event.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm"
            >
              {LOCALES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.flag} {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative min-h-[65vh] flex-1 md:min-h-0">
            <div className="absolute inset-0">
              <Editor
                ref={editor}
                collab={shared}
                chunkLabels={chunkLabels}
                onChange={setDoc}
                onSelectionChange={setSelection}
              />
            </div>
            {review && (
              // Private review: covers the shared editor, which keeps syncing underneath.
              <div className="absolute inset-0 z-10" data-testid="review">
                <Editor
                  key={review.id}
                  ref={reviewEditor}
                  initialDoc={review.snapshot}
                  proposal={review.proposal}
                  chunkLabels={chunkLabels}
                  onChange={setReviewDoc}
                  onChunks={onChunks}
                />
              </div>
            )}
          </div>
        </section>
        <section className="min-h-0 overflow-auto bg-neutral-50/60"><Preview doc={review ? reviewDoc || review.snapshot : doc} /></section>
      </main>

      <footer className="flex flex-wrap gap-x-4 border-t border-neutral-200 px-5 py-1.5 text-xs text-neutral-500">
        <span>{MODELS.find((m) => m.id === model)?.label}</span>
        <span>{copy.lastRequest(usd(spend.last))}</span>
        <span>{copy.thisSession(usd(spend.total))}</span>
        <span className="ml-auto">{budgetLabel}</span>
      </footer>
    </div>
  );
}
