"use client";

import { useEffect, useRef, useState } from "react";
import AiBar, { type Mode } from "@/components/AiBar";
import Editor, { type EditorHandle, type Range } from "@/components/Editor";
import Preview from "@/components/Preview";
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

type BudgetState = Budget | { mock: true } | null;

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
  const [mode, setMode] = useState<Mode>("idle");
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spend, setSpend] = useState({ last: 0, total: 0 });
  const [budget, setBudget] = useState<BudgetState>(null);

  useEffect(() => {
    fetchBudget().then(setBudget);
  }, []);

  useEffect(() => {
    if (mode === "reviewing") return; // never persist a pending proposal
    try {
      localStorage.setItem(STORAGE_KEY, doc);
    } catch {}
  }, [doc, mode]);

  async function run(instruction: string) {
    const ed = editor.current;
    if (!ed) return;
    const refining = mode === "reviewing" && review !== null;
    const target = refining ? review.selection : selection.from === selection.to ? null : selection;
    const history = refining ? review.history : [];
    if (refining) ed.rejectAll(); // back to the original before proposing again
    const document = ed.getDoc();
    const range = target ?? { from: 0, to: document.length };

    setMode("loading");
    setError(null);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, selection: target, instruction, model, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

      setSpend((s) => ({ last: data.cost, total: s.total + data.cost }));
      fetchBudget().then(setBudget);
      const count = ed.propose(range, data.text);
      if (count === 0) {
        setError("The co-author found nothing to change here.");
        setMode("idle");
        setReview(null);
        return;
      }
      setReview({ selection: target, history: [...history, { instruction, proposal: data.text }], changeCount: count });
      setMode("reviewing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      const last = history.at(-1);
      if (refining && last) {
        ed.propose(range, last.proposal); // a failed refine keeps the previous proposal
        setMode("reviewing");
      } else {
        setMode("idle");
        setReview(null);
      }
    }
  }

  function finish(action: "acceptAll" | "rejectAll") {
    editor.current?.[action]();
    setMode("idle");
    setReview(null);
    setError(null);
  }

  function onChunks(count: number) {
    if (count === 0) {
      setMode("idle");
      setReview(null);
    } else {
      setReview((r) => (r ? { ...r, changeCount: count } : r));
    }
  }

  const selectionWords =
    selection.from !== selection.to
      ? doc.slice(selection.from, selection.to).split(/\s+/).filter(Boolean).length
      : 0;

  const budgetLabel =
    budget === null
      ? ""
      : "mock" in budget
        ? "Mock mode: no API calls are made"
        : budget.remaining !== null && budget.limit !== null
          ? `Demo budget: $${budget.remaining.toFixed(2)} of $${budget.limit.toFixed(2)} left`
          : `Key usage so far: $${budget.usage.toFixed(2)}`;

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-900">
      <header className="flex flex-wrap items-baseline gap-x-3 border-b border-neutral-200 px-5 py-3">
        <h1 className="text-base font-semibold">Co-author</h1>
        <p className="text-sm text-neutral-500">
          Write Markdown. Select some text, ask for a change, and review it as tracked edits.
        </p>
      </header>

      <AiBar
        mode={mode}
        selectionWords={selectionWords}
        changeCount={review?.changeCount ?? 0}
        model={model}
        error={error}
        onModelChange={setModel}
        onRun={run}
        onAcceptAll={() => finish("acceptAll")}
        onRejectAll={() => finish("rejectAll")}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        <section className="min-h-0 overflow-hidden border-r border-neutral-200">
          <Editor
            ref={editor}
            initialDoc={doc}
            onChange={setDoc}
            onSelectionChange={setSelection}
            onChunks={onChunks}
          />
        </section>
        <section className="min-h-0 overflow-auto bg-neutral-50/60"><Preview doc={doc} /></section>
      </main>

      <footer className="flex flex-wrap gap-x-4 border-t border-neutral-200 px-5 py-1.5 text-xs text-neutral-500">
        <span>{MODELS.find((m) => m.id === model)?.label}</span>
        <span>Last request {usd(spend.last)}</span>
        <span>This session {usd(spend.total)}</span>
        <span className="ml-auto">{budgetLabel}</span>
      </footer>
    </div>
  );
}
