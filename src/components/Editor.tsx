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
};

type Props = {
  ref: Ref<EditorHandle>;
  initialDoc: string;
  onChange(doc: string): void;
  onSelectionChange(range: Range): void;
  /** Fires while reviewing whenever the number of open chunks changes; 0 means review ended. */
  onChunks(count: number): void;
};

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px", backgroundColor: "white" },
  ".cm-scroller": {
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    lineHeight: "1.65",
    padding: "20px 0 40vh",
  },
  ".cm-content": { padding: "0 24px", maxWidth: "80ch" },
  "&.cm-focused": { outline: "none" },
  ".cm-chunkButtons": { fontFamily: "var(--font-geist-sans), sans-serif", fontSize: "12px" },
});

export default function Editor({ ref, initialDoc, onChange, onSelectionChange, onChunks }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const merge = useRef(new Compartment());
  const reviewing = useRef(false);
  const lastCount = useRef(0);
  const callbacks = useRef({ onChange, onSelectionChange, onChunks });
  useEffect(() => {
    callbacks.current = { onChange, onSelectionChange, onChunks };
  });

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
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const { from, to } = update.state.selection.main;
              callbacks.current.onSelectionChange({ from, to });
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
            mergeControls: true,
            allowInlineDiffs: true,
          }),
        ),
        changes: { from: range.from, to: range.to, insert: text },
        selection: { anchor: range.from },
        scrollIntoView: true,
      });
      const count = getChunks(v.state)?.chunks.length ?? 0;
      lastCount.current = count;
      if (count === 0) endReview(v);
      else reviewing.current = true;
      return count;
    },
    acceptAll() {
      endReview(view.current!);
    },
    rejectAll() {
      const v = view.current!;
      reviewing.current = false; // the restore below must not be reported as "0 chunks"
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: getOriginalDoc(v.state) } });
      endReview(v);
    },
  }));

  return <div ref={host} className="h-full" />;
}
