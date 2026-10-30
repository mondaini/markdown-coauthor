"use client";

import { useEffect, useRef, useState } from "react";
import { QUICK_ACTIONS, type Messages } from "@/lib/i18n";
import { MODELS, type ModelId } from "@/lib/models";

export type Mode = "idle" | "loading" | "reviewing";

type Props = {
  mode: Mode;
  /** 0 means the whole document is the target */
  selectionWords: number;
  changeCount: number;
  model: ModelId;
  copy: Messages;
  error: string | null;
  onModelChange(id: ModelId): void;
  /** In idle mode: ask for a suggestion. In reviewing mode: refine the current one. */
  onRun(instruction: string): void;
  onAcceptAll(): void;
  onRejectAll(): void;
};

export default function AiBar(props: Props) {
  const { mode, selectionWords, changeCount, model, copy, error, onModelChange, onRun, onAcceptAll, onRejectAll } = props;
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
    ? copy.changes(changeCount)
    : selectionWords > 0
      ? copy.selection(selectionWords)
      : copy.wholeDocument;

  return (
    <div className={`border-b px-5 py-2.5 ${reviewing ? "bg-amber-50 border-amber-200" : "bg-neutral-50 border-neutral-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${reviewing ? "bg-amber-200 text-amber-900" : "bg-neutral-200 text-neutral-700"}`}>
          {busy ? copy.thinking : target}
        </span>

        {reviewing && (
          <>
            <button type="button" onClick={onAcceptAll} disabled={busy} className="btn btn-primary">
              {copy.acceptAll}
            </button>
            <button type="button" onClick={onRejectAll} disabled={busy} className="btn">
              {copy.rejectAll}
            </button>
            <span className="text-xs text-neutral-500">{copy.reviewHint}</span>
          </>
        )}

        {!reviewing &&
          QUICK_ACTIONS.map((action) => (
            <button key={action.id} type="button" onClick={() => onRun(action.instruction)} disabled={busy} className="btn">
              {copy.quick[action.id]}
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
            placeholder={reviewing ? copy.refinePlaceholder : copy.placeholder}
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="btn btn-primary">
            {reviewing ? copy.refine : copy.go}
          </button>
        </form>

        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value as ModelId)}
          disabled={busy}
          title={copy.price[model]}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {copy.tier[m.tier]}: {m.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
