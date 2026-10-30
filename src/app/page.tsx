"use client";

import dynamic from "next/dynamic";

// CodeMirror and localStorage are browser-only, so the app shell skips SSR entirely.
const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => <p className="p-5 text-sm text-neutral-500">…</p>,
});

export default function Page() {
  return <App />;
}
