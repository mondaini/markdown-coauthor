# Co-author: an AI-assisted Markdown editor

Write Markdown, select some text (or nothing, for the whole document), ask for a change, and review the AI's suggestion as tracked edits before it touches your text. Documents have shareable links and can be edited by several people at once.

**Live demo:** https://markdown-coauthor.vercel.app · **Full feature list and history:** [CHANGELOG.md](CHANGELOG.md)

## How to run it

**Prerequisites:** Node 24 (see `.nvmrc`) and npm. Node 20 also runs it, with a deprecation warning from supabase-js.

```bash
npm ci
cp .env.example .env.local   # then fill in what you need, see below
npm run dev                  # http://localhost:3000
```

Environment variables (all optional; see `.env.example`):

| Variable | What it does |
|---|---|
| `OPENROUTER_API_KEY` | Key for the AI suggestions, sent server-side to OpenRouter. Without it (and without `MOCK_AI`), the editor works but every AI request shows a "missing key" message. |
| `MOCK_AI` | Set to `1` to run without any API calls or cost. Suggestions are deterministic fakes; translations of the sample document are canned copies. Use this to try the UI without spending the budget. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Turn on shareable, real-time documents. Without them the app runs single-user and unsaved, with a "collaboration off" note. With them, also run `supabase/migrations/0001_doc_updates.sql` once (Supabase SQL editor or `psql`). |

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the build
npm run lint
npm run typecheck  # next typegen + tsc
npm test           # vitest unit tests (no network)
```

## What I built

A co-author that proposes edits you review, never edits behind your back:

- **Editor and preview.** CodeMirror 6 Markdown editor with a live rendered preview side by side.
- **Suggestions on the selection or the whole document.** A selection is sent with the text around it and the document's outline as context.
- **Inline diff.** The suggestion appears as tracked changes using `@codemirror/merge`'s unified merge view.
- **Accept or reject each hunk**, or everything at once with Accept all / Reject all.
- **Refine loop.** Not quite right? Give a follow-up instruction. Earlier rounds are sent as history, so the model refines its last attempt instead of starting over.
- **Quick actions** (Improve, Shorten, Expand, Fix grammar, More formal, More casual) and a free-text box focused with ⌘K.
- **Model picker** with a curated list (Claude Haiku 5.5 by default, GPT-6 Luna, Claude Sonnet 5.5) and per-model pricing.
- **Cost visibility and a demo budget.** The footer shows the cost of the last request, the session total and what is left of the demo key's budget.
- **Four interface languages** (en-US, pt-BR, es-AR, zh-CN), plus a "Text language" selector that translates the document as tracked changes. Translations are cached, and translating back restores the original text for free.
- **Real-time shareable documents.** Each document has its own URL (`/d/<id>`); opening `/` creates one. Collaborators see each other's edits and cursors live, and the text is saved.

## Design decisions & trade-offs

- **Supabase, despite "don't add infrastructure you don't need".** Shareable links and live co-editing need a realtime channel and somewhere to keep the text, and Vercel functions can't hold a document's connections together. Supabase provides both (Realtime broadcast plus Postgres) as one external dependency. It is optional: without its env vars the app runs single-user. The table has no select policy: anyone can append edits, but a document can only be read through the `doc_updates_for(id)` function, so documents can't be listed in bulk.
- **AI suggestions stay private until accepted.** In a shared document, unreviewed AI text must not appear for everyone. The suggestion is reviewed in a private overlay, and only the accepted result is written to the shared text, as one edit. If a collaborator changed that text meanwhile, it is refused rather than overwriting their work.
- **Edits are stored as an append-only log.** Each client saves only its own Yjs updates, so two people saving at once can't overwrite each other. The cost is that the log grows (see below).
- **`/api/suggest` is unauthenticated.** It is protected by server-side limits instead: a model allowlist (a client can't pick an expensive model), a 20,000-character cap on whole-document edits, bounded `max_tokens`, and a budget floor that stops requests when the shared key has less than $0.50 left.
- **Small, boring stack.** Plain `fetch` to OpenRouter instead of an SDK, a mock mode so UI work costs nothing, and in-memory caches where losing them only costs a repeat request.

## What I'd do differently with more time

- **Tests beyond the pure logic.** The unit tests cover prompt building, reply cleanup and the mock. Accept/reject, the review overlay and collaboration were verified with scripted headless-browser runs, not committed tests. I'd add Playwright tests for those paths.
- **Rate limiting and auth on `/api/suggest`.** The budget cap stops runaway spend, but one visitor can still use up the shared budget. Per-IP or per-document rate limits, or sign-in, would fix that.
- **Access control for documents.** Anyone with a link can edit, and anyone with the public key can append to any document id they know. Supabase anonymous sign-in with private channels would add real permissions.
- **Edit-log compaction.** Every save adds a row, so load time grows with a document's history. A periodic job should merge each document's rows into one.
- **Translation during collaboration.** A whole-document translation is refused if anyone typed anywhere during its review. Translating section by section would make this rarer.
- **Durable saves on tab close.** The last half-second of typing before a tab closes may be lost if the browser drops the final save.
- **Shared caches.** The translation and budget caches live in one server instance's memory and are lost on deploy. Vercel Runtime Cache would share them.
- **Streaming suggestions.** Long rewrites currently wait for the full response.

## How I used AI to build it

I built this with Claude Code as the main tool, plus one Grok session. The raw, unedited transcripts are in the repo: [.claude/README.md](.claude/README.md) lists each session, with the files under `.claude/projects/` and `.grok/sessions/`.

Roughly how the work went:
- **Planning first.** Each feature started with a written plan, and I made the product calls myself: Supabase over the alternatives, private review, what `/` should do.
- **Parallel agents for breadth.** A code review produced 15 findings, which 15 subagents fixed in isolated copies; I merged the patches and resolved the conflicts. The collaboration design came out of three parallel research agents covering the codebase, sync providers and how other editors handle AI suggestions.
- **Verification over trust.** Every change was checked by running the app: scripted headless Chrome sessions (two tabs for collaboration), curl against the API routes, and direct database probes for the security rules. A real bug, Haiku returning Chinese text untranslated, was found this way and fixed in the prompt.
