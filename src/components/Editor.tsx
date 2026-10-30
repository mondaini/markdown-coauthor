"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightSpecialChars, keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { getChunks, getOriginalDoc, unifiedMergeView } from "@codemirror/merge";
import { minimalSetup } from "codemirror";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

export type Range = { from: number; to: number };

/** A range pinned to the shared text, so it follows collaborators' edits around it. */
export type Anchors = { from: Y.RelativePosition; to: Y.RelativePosition };

export type EditorHandle = {
  getDoc(): string;
  /** Review editor: keep the proposal as-is and leave review mode. */
  acceptAll(): void;
  /** Review editor: restore whatever is still marked as original and leave review mode. */
  rejectAll(): void;
  /** Shared editor: pin a range to the shared text. */
  anchor(range: Range): Anchors;
  /** Shared editor: the anchored text now, or null if it can no longer be found. */
  read(anchors: Anchors): string | null;
  /** Shared editor: replace the anchored text if it still equals `expected`. False means someone changed it. */
  replaceIfUnchanged(anchors: Anchors, expected: string, text: string): boolean;
};

type Props = {
  ref: Ref<EditorHandle>;
  /** Shared editor: bound to the Yjs text, with live cursors. Without it this is a read-only review editor. */
  collab?: { text: Y.Text; awareness: Awareness };
  /** Review editor: the snapshot to review. */
  initialDoc?: string;
  /** Review editor: shown as tracked changes over the snapshot. A new object starts a new round from the snapshot. */
  proposal?: { range: Range; text: string };
  /** Labels for the per-chunk Accept / Reject buttons. */
  chunkLabels: { accept: string; reject: string };
  onChange?(doc: string): void;
  onSelectionChange?(range: Range): void;
  /** Fires while reviewing whenever the number of open chunks changes; 0 means review ended. */
  onChunks?(count: number): void;
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

/** minimalSetup without its undo history: in the shared editor Yjs keeps one undo stack per user. */
const sharedSetup = [
  highlightSpecialChars(),
  drawSelection(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
];

export default function Editor({ ref, collab, initialDoc = "", proposal, chunkLabels, onChange, onSelectionChange, onChunks }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const merge = useRef(new Compartment());
  const phrases = useRef(new Compartment());
  const reviewing = useRef(false);
  const lastCount = useRef(0);
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
        doc: collab ? collab.text.toString() : initialDoc,
        extensions: [
          collab ? [sharedSetup, yCollab(collab.text, collab.awareness)] : [minimalSetup, EditorState.readOnly.of(true)],
          markdown(),
          EditorView.lineWrapping,
          keymap.of([indentWithTab]),
          merge.current.of([]),
          phrases.current.of(chunkPhrases(chunkLabels.accept, chunkLabels.reject)),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange?.(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const { from, to } = update.state.selection.main;
              callbacks.current.onSelectionChange?.({ from, to });
            }
            // Accepting a chunk inline updates the *original*, not the doc, so check on every update.
            if (reviewing.current) {
              const count = getChunks(update.state)?.chunks.length ?? 0;
              if (count !== lastCount.current) {
                lastCount.current = count;
                callbacks.current.onChunks?.(count);
                // Can't dispatch from inside an update; finish on the next tick.
                if (count === 0) queueMicrotask(() => { if (view.current === v) endReview(v); });
              }
            }
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      view.current = null;
      v.destroy();
    };
    // Mount once; the editor (or Yjs) owns the document after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each new proposal (first one, or a refine) starts again from the untouched snapshot.
  useEffect(() => {
    const v = view.current;
    if (!v || !proposal) return;
    reviewing.current = false;
    // Drop any previous round (and its inline accepts), then add the merge view and the proposal together,
    // so the merge view's original is the clean snapshot.
    v.dispatch({ effects: merge.current.reconfigure([]), changes: { from: 0, to: v.state.doc.length, insert: initialDoc } });
    v.dispatch({
      effects: merge.current.reconfigure(unifiedMergeView({ original: initialDoc, allowInlineDiffs: true })),
      changes: { from: proposal.range.from, to: proposal.range.to, insert: proposal.text },
      selection: { anchor: proposal.range.from },
      scrollIntoView: true,
    });
    const count = getChunks(v.state)?.chunks.length ?? 0;
    lastCount.current = count;
    callbacks.current.onChunks?.(count);
    if (count === 0) endReview(v);
    else reviewing.current = true;
    // initialDoc is fixed for a review editor's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal]);

  function resolve(anchors: Anchors) {
    const ydoc = collab!.text.doc!;
    const from = Y.createAbsolutePositionFromRelativePosition(anchors.from, ydoc);
    const to = Y.createAbsolutePositionFromRelativePosition(anchors.to, ydoc);
    if (!from || !to || to.index < from.index) return null;
    return { from: from.index, to: to.index };
  }

  useImperativeHandle(ref, () => ({
    getDoc: () => view.current!.state.doc.toString(),
    acceptAll() {
      endReview(view.current!);
    },
    rejectAll() {
      const v = view.current!;
      reviewing.current = false; // the restore below must not be reported as "0 chunks"
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: getOriginalDoc(v.state) } });
      endReview(v);
    },
    anchor(range) {
      const text = collab!.text;
      // from sticks to the first character, to to the last, so text typed just outside isn't swallowed.
      return {
        from: Y.createRelativePositionFromTypeIndex(text, range.from),
        to: Y.createRelativePositionFromTypeIndex(text, range.to, -1),
      };
    },
    read(anchors) {
      const at = resolve(anchors);
      return at ? view.current!.state.doc.sliceString(at.from, at.to) : null;
    },
    replaceIfUnchanged(anchors, expected, text) {
      const at = resolve(anchors);
      const v = view.current!;
      if (!at || v.state.doc.sliceString(at.from, at.to) !== expected) return false;
      // Send only the part that differs, so collaborators' cursors around it stay put.
      let start = 0;
      while (start < expected.length && start < text.length && expected[start] === text[start]) start++;
      let end = 0;
      while (
        end < expected.length - start &&
        end < text.length - start &&
        expected[expected.length - 1 - end] === text[text.length - 1 - end]
      ) end++;
      v.dispatch({
        changes: { from: at.from + start, to: at.to - end, insert: text.slice(start, text.length - end) },
        userEvent: "input.ai",
      });
      return true;
    },
  }));

  return <div ref={host} className="h-full" />;
}
