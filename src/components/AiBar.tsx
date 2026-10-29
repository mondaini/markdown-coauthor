"use client";

import { useEffect, useRef, useState } from "react";
import { MODELS, type ModelId } from "@/lib/models";

export type Mode = "idle" | "loading" | "reviewing";

type Props = {
  mode: Mode;
  /** 0 means the whole document is the target */
  selectionWords: number;
  changeCount: number;
  model: ModelId;
  error: string | null;
  onModelChange(id: ModelId): void;
  /** In idle mode: ask for a suggestion. In reviewing mode: refine the current one. */
  onRun(instruction: string): void;
  onAcceptAll(): void;
  onRejectAll(): void;
};

const QUICK_ACTIONS: [label: string, instruction: string][] = [
  ["Improve", "Improve clarity and flow without changing the meaning."],
  ["Shorten", "Make this more concise. Cut filler, keep every point."],
  ["Expand", "Expand this with one or two concrete details or examples."],
  ["Fix grammar", "Fix spelling, grammar and punctuation only."],
  ["More formal", "Rewrite in a more formal, professional tone."],
  ["More casual", "Rewrite in a relaxed, conversational tone."],
];

export default function AiBar(props: Props) {
  const { mode, selectionWords, changeCount, model, error, onModelChange, onRun, onAcceptAll, onRejectAll } = props;
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const busy = mode === "loading";
  const reviewing = mode === "reviewing";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    onRun(text);
  }

  const target = reviewing
    ? `${changeCount} suggested ${changeCount === 1 ? "change" : "changes"}`
    : selectionWords > 0
      ? `Selection, ${selectionWords} ${selectionWords === 1 ? "word" : "words"}`
      : "Whole document";

  return (
    <div className={`border-b px-5 py-2.5 ${reviewing ? "bg-amber-50 border-amber-200" : "bg-neutral-50 border-neutral-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${reviewing ? "bg-amber-200 text-amber-900" : "bg-neutral-200 text-neutral-700"}`}>
          {busy ? "Thinking…" : target}
        </span>

        {reviewing && (
          <>
            <button type="button" onClick={onAcceptAll} disabled={busy} className="btn btn-primary">
              Accept all
            </button>
            <button type="button" onClick={onRejectAll} disabled={busy} className="btn">
              Reject all
            </button>
            <span className="text-xs text-neutral-500">or review each change inline, or refine:</span>
          </>
        )}

        {!reviewing &&
          QUICK_ACTIONS.map(([label, instruction]) => (
            <button key={label} type="button" onClick={() => onRun(instruction)} disabled={busy} className="btn">
              {label}
            </button>
          ))}

        <form
          className="flex flex-1 min-w-[260px] items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            placeholder={reviewing ? "Refine: e.g. shorter, keep my examples…" : "Or tell the co-author what to do…  (⌘K)"}
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="btn btn-primary">
            {reviewing ? "Refine" : "Go"}
          </button>
        </form>

        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value as ModelId)}
          disabled={busy}
          title={MODELS.find((m) => m.id === model)?.price}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.tier}: {m.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
