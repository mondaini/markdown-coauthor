"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { getChunks, getOriginalDoc, unifiedMergeView } from "@codemirror/merge";
import { minimalSetup } from "codemirror";

export type Range = { from: number; to: number };

export type EditorHandle = {
  getDoc(): string;
  /** Show `text` as tracked changes replacing `range`. Returns the number of changed chunks. */
  propose(range: Range, text: string): number;
  /** Keep the proposal as-is and leave review mode. */
  acceptAll(): void;
  /** Restore whatever is still marked as original and leave review mode. */
  rejectAll(): void;
  /** Whether any chunk of the last proposal was kept (accepted inline or by acceptAll). Manual edits don't count. */
  proposalKept(): boolean;
};

type Props = {
  ref: Ref<EditorHandle>;
  initialDoc: string;
  /** Labels for the per-chunk Accept / Reject buttons. */
  chunkLabels: { accept: string; reject: string };
  onChange(doc: string): void;
  onSelectionChange(range: Range): void;
  /** Fires while reviewing whenever the number of open chunks changes; 0 means review ended. */
  onChunks(count: number): void;
};

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px", backgroundColor: "white" },
  ".cm-scroller": {
    fontFamily: 'var(--font-geist-mono), ui-monospace, "Noto Sans Mono CJK SC", "PingFang SC", "Microsoft YaHei", monospace',
    lineHeight: "1.65",
    padding: "20px 0 40vh",
  },
  ".cm-content": { padding: "0 24px", maxWidth: "80ch" },
  "&.cm-focused": { outline: "none" },
  ".cm-chunkButtons": { fontFamily: 'var(--font-geist-sans), "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif', fontSize: "12px" },
});

// Phrase keys used by @codemirror/merge for its default chunk buttons.
const chunkPhrases = (accept: string, reject: string) => EditorState.phrases.of({ Accept: accept, Reject: reject });

export default function Editor({ ref, initialDoc, chunkLabels, onChange, onSelectionChange, onChunks }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const merge = useRef(new Compartment());
  const phrases = useRef(new Compartment());
  const reviewing = useRef(false);
  const lastCount = useRef(0);
  /** Doc ranges of the proposal's text, mapped through edits; rejecting a chunk drops its range. */
  const proposal = useRef<Range[]>([]);
  const kept = useRef(false);
  const callbacks = useRef({ onChange, onSelectionChange, onChunks });
  useEffect(() => {
    callbacks.current = { onChange, onSelectionChange, onChunks };
  });

  useEffect(() => {
    view.current?.dispatch({ effects: phrases.current.reconfigure(chunkPhrases(chunkLabels.accept, chunkLabels.reject)) });
    // Chunk widgets cache their DOM, so buttons already on screen keep the old label until relabelled.
    const root = host.current;
    if (!root) return;
    root.querySelectorAll<HTMLButtonElement>('button[name="accept"]').forEach((button) => {
      button.textContent = chunkLabels.accept;
    });
    root.querySelectorAll<HTMLButtonElement>('button[name="reject"]').forEach((button) => {
      button.textContent = chunkLabels.reject;
    });
  }, [chunkLabels.accept, chunkLabels.reject]);

  function endReview(v: EditorView) {
    reviewing.current = false;
    v.dispatch({ effects: merge.current.reconfigure([]) });
  }

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          minimalSetup,
          markdown(),
          EditorView.lineWrapping,
          keymap.of([indentWithTab]),
          merge.current.of([]),
          phrases.current.of(chunkPhrases(chunkLabels.accept, chunkLabels.reject)),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const { from, to } = update.state.selection.main;
              callbacks.current.onSelectionChange({ from, to });
            }
            if (update.docChanged) {
              const replaced: Range[] = [];
              update.changes.iterChangedRanges((from, to) => replaced.push({ from, to }));
              proposal.current = proposal.current
                .filter((r) => !replaced.some((c) => c.from <= r.from && r.to <= c.to)) // e.g. a rejected chunk
                .map((r) => ({ from: update.changes.mapPos(r.from, 1), to: update.changes.mapPos(r.to, -1) }))
                .filter((r) => r.from < r.to);
            }
            // An inline accept leaves the doc alone and drops that chunk; kept if it held proposal text.
            // ponytail: deletion-only proposal chunks have no text to track, so accepting one alone doesn't count.
            if (reviewing.current && update.transactions.some((tr) => tr.isUserEvent("accept"))) {
              const after = getChunks(update.state)?.chunks ?? [];
              const accepted = (getChunks(update.startState)?.chunks ?? []).filter(
                (c) => !after.some((a) => a.fromB === c.fromB && a.toB === c.toB),
              );
              if (accepted.some((c) => proposal.current.some((r) => r.from < c.toB && c.fromB < r.to))) kept.current = true;
            }
            // Accepting a chunk inline updates the *original*, not the doc, so check on every update.
            if (reviewing.current) {
              const count = getChunks(update.state)?.chunks.length ?? 0;
              if (count !== lastCount.current) {
                lastCount.current = count;
                callbacks.current.onChunks(count);
                // Can't dispatch from inside an update; finish on the next tick.
                if (count === 0) queueMicrotask(() => endReview(v));
              }
            }
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // Mount once; the editor owns the document after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    getDoc: () => view.current!.state.doc.toString(),
    propose(range, text) {
      const v = view.current!;
      v.dispatch({
        effects: merge.current.reconfigure(
          unifiedMergeView({
            original: v.state.doc.toString(),
            allowInlineDiffs: true,
          }),
        ),
        changes: { from: range.from, to: range.to, insert: text },
        selection: { anchor: range.from },
        scrollIntoView: true,
      });
      const chunks = getChunks(v.state)?.chunks ?? [];
      const count = chunks.length;
      lastCount.current = count;
      proposal.current = chunks.map((c) => ({ from: c.fromB, to: c.toB })).filter((r) => r.from < r.to);
      kept.current = false;
      if (count === 0) endReview(v);
      else reviewing.current = true;
      return count;
    },
    acceptAll() {
      if (proposal.current.length > 0) kept.current = true; // surviving proposal text is open or already accepted
      endReview(view.current!);
    },
    rejectAll() {
      const v = view.current!;
      reviewing.current = false; // the restore below must not be reported as "0 chunks"
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: getOriginalDoc(v.state) } });
      endReview(v);
    },
    proposalKept: () => kept.current,
  }));

  return <div ref={host} className="h-full" />;
}
