"use client";

import { useEffect, useRef, useState } from "react";
import AiBar, { type Mode } from "@/components/AiBar";
import Editor, { type EditorHandle, type Range } from "@/components/Editor";
import Preview from "@/components/Preview";
import {
  DEFAULT_LOCALE,
  DOC_LOCALE_STORAGE_KEY,
  isLocale,
  LOCALES,
  LOCALE_STORAGE_KEY,
  messages,
  readLocale,
  readStoredLocale,
  translateInstruction,
  type Locale,
  type Messages,
} from "@/lib/i18n";
import { DEFAULT_MODEL, MODELS, type ModelId } from "@/lib/models";
import type { Budget } from "@/lib/openrouter";
import type { HistoryStep } from "@/lib/prompt";
import { SAMPLE_DOC } from "@/lib/sample";

const STORAGE_KEY = "coauthor.doc";

type Review = {
  /** null = the whole document */
  selection: Range | null;
  history: HistoryStep[];
  changeCount: number;
};

type BudgetState = Budget | { mock: true } | { noKey: true } | null;

type Notice =
  | null
  | { kind: "nothing" }
  | { kind: "generic" }
  | { kind: "http"; status: number; error?: string; remaining?: number; translating?: boolean };

function noticeText(notice: Notice, copy: Messages): string | null {
  if (!notice) return null;
  if (notice.kind === "nothing") return copy.nothing;
  if (notice.kind === "generic") return copy.generic;
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

function loadDoc() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE_DOC;
  } catch {
    return SAMPLE_DOC;
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

export default function App() {
  const editor = useRef<EditorHandle>(null);
  const [doc, setDoc] = useState(loadDoc);
  const [selection, setSelection] = useState<Range>({ from: 0, to: 0 });
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [locale, setLocale] = useState<Locale>(readLocale);
  const [docLocale, setDocLocale] = useState<Locale>(() =>
    readStoredLocale(DOC_LOCALE_STORAGE_KEY, DEFAULT_LOCALE),
  );
  /** Language chosen for an in-flight translation. The document language updates only if the edit is kept. */
  const [translateTo, setTranslateTo] = useState<Locale | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [spend, setSpend] = useState({ last: 0, total: 0 });
  const [budget, setBudget] = useState<BudgetState>(null);
  /** "locale\0translated text" -> the text it was translated from, so translating back restores the original for free. */
  const originals = useRef(new Map<string, string>());
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
    try {
      localStorage.setItem(DOC_LOCALE_STORAGE_KEY, docLocale);
    } catch {
      // Preference simply won't persist.
    }
  }, [docLocale]);

  useEffect(() => {
    fetchBudget().then(setBudget);
  }, []);

  useEffect(() => {
    if (mode === "reviewing") return; // never persist a pending proposal
    try {
      localStorage.setItem(STORAGE_KEY, doc);
    } catch {}
  }, [doc, mode]);

  /** Flip the document language only if some translated text was kept; a manual edit during review doesn't count. */
  function keepTranslationIfKept() {
    if (translateTo && editor.current?.proposalKept()) setDocLocale(translateTo);
    setTranslateTo(null);
  }

  async function run(instruction: string, options?: { translateTo?: Locale }) {
    const ed = editor.current;
    if (!ed || mode === "loading") return;
    const translating = options?.translateTo != null;
    const refining = !translating && mode === "reviewing" && review !== null;
    // On failure, bring back the proposal under review: a refine's, or a non-translation one a translation replaced.
    const restore = refining || (translating && mode === "reviewing" && translateTo === null) ? review : null;
    if (translating && mode === "reviewing") ed.rejectAll();
    const target = translating ? null : refining ? review!.selection : selection.from === selection.to ? null : selection;
    const history = refining ? review!.history : [];
    if (refining) ed.rejectAll(); // back to the original before proposing again
    const document = ed.getDoc();
    const range = target ?? { from: 0, to: document.length };
    if (translating) setTranslateTo(options.translateTo!);

    const original = translating ? originals.current.get(`${options.translateTo}\0${document}`) : undefined;

    setMode("loading");
    setNotice(null);
    try {
      const res =
        original === undefined
          ? await fetch("/api/suggest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ document, selection: target, instruction, model, history }),
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
      if (translating && data.text !== document) originals.current.set(`${docLocale}\0${data.text}`, document);
      const count = ed.propose(range, data.text);
      if (count === 0) {
        setNotice({ kind: "nothing" });
        if (translating) setTranslateTo(null);
        setMode("idle");
        setReview(null);
        return;
      }
      setReview({ selection: target, history: [...history, { instruction, proposal: data.text }], changeCount: count });
      setMode("reviewing");
    } catch {
      setNotice((current) => current ?? { kind: "generic" });
      if (translating) setTranslateTo(null);
      const last = restore?.history.at(-1);
      if (restore && last) {
        ed.propose(restore.selection ?? range, last.proposal); // a failed request keeps the previous proposal
        setMode("reviewing");
      } else {
        setMode("idle");
        setReview(null);
      }
    }
  }

  function finish(action: "acceptAll" | "rejectAll") {
    editor.current?.[action]();
    keepTranslationIfKept(); // reject keeps chunks already accepted inline
    setMode("idle");
    setReview(null);
    setNotice(null);
  }

  function onChunks(count: number) {
    if (count === 0) {
      keepTranslationIfKept();
      setMode("idle");
      setReview(null);
    } else {
      setReview((r) => (r ? { ...r, changeCount: count } : r));
    }
  }

  function onDocumentLanguage(value: string) {
    if (!isLocale(value) || mode === "loading") return;
    if (value === (translateTo ?? docLocale)) return;
    if (value === docLocale && translateTo) {
      finish("rejectAll");
      return;
    }
    void run(translateInstruction(value), { translateTo: value });
  }

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

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-900">
      <header className="flex items-start gap-4 border-b border-neutral-200 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">{copy.product}</h1>
          <p className="text-sm text-neutral-500">{copy.tagline}</p>
        </div>
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
        mode={mode}
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
              value={translateTo ?? docLocale}
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
                initialDoc={doc}
                chunkLabels={{ accept: copy.acceptChunk, reject: copy.rejectChunk }}
                onChange={setDoc}
                onSelectionChange={setSelection}
                onChunks={onChunks}
              />
            </div>
          </div>
        </section>
        <section className="min-h-0 overflow-auto bg-neutral-50/60"><Preview doc={doc} /></section>
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
