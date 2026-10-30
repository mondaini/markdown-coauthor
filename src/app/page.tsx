"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { newDocId, seedKey } from "@/lib/collab";
import { SAMPLE_DOC } from "@/lib/sample";

/** The single-document app saved its text here before documents had their own URL. */
const LEGACY_DOC_KEY = "coauthor.doc";

/** Every visit creates a new shared document and moves to its URL. */
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    const id = newDocId();
    let seed = SAMPLE_DOC;
    try {
      // The first document in this browser keeps the text written before sharing existed.
      seed = localStorage.getItem(LEGACY_DOC_KEY) ?? SAMPLE_DOC;
      localStorage.removeItem(LEGACY_DOC_KEY);
      sessionStorage.setItem(seedKey(id), seed);
    } catch {
      // Storage can be blocked; the document then starts empty.
    }
    router.replace(`/d/${id}`);
  }, [router]);

  return <p className="p-5 text-sm text-neutral-500">…</p>;
}
