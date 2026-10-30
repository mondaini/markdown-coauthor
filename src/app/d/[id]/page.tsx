"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// CodeMirror, Yjs and browser storage are browser-only, so the app shell skips SSR entirely.
const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => <Loading />,
});

function Loading() {
  return <p className="p-5 text-sm text-neutral-500">…</p>;
}

// The id is only known at request time, so it streams in under Suspense (required with Cache Components).
function Document() {
  const { id } = useParams<{ id: string }>();
  return <App docId={id} />;
}

export default function DocumentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Document />
    </Suspense>
  );
}
