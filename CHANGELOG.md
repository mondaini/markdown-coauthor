# Changelog

A Markdown editor with an AI co-author. Select text (or nothing, for the whole document), ask for a change, and review the result as tracked edits.

Live demo: https://chiri-challenge.vercel.app

## What is implemented

### Editor and review
- Markdown editor (CodeMirror 6) with a live rendered preview side by side.
- AI suggestions shown as tracked changes in a unified merge view. Accept or reject each change inline, or all at once.
- Works on the selection, or on the whole document when nothing is selected. A selection gets the surrounding text and the document outline as context.
- Refine a suggestion with a follow-up instruction. The co-author keeps the earlier rounds as history. A failed refine keeps the previous suggestion.
- Six quick actions (Improve, Shorten, Expand, Fix grammar, More formal, More casual) plus a free-text instruction box (⌘K).
- The document is saved in the browser. A pending suggestion is never saved.

### Languages
- Interface in English, Brazilian Portuguese, Argentine Spanish, and Simplified Chinese. Defaults to the browser language and is remembered.
- "Text language" selector, with flags, translates the whole document with the co-author as tracked changes.
- The document language changes only when translated text is kept, inline or with Accept all. Manual edits during review do not count.
- Chinese text gets CJK font fallbacks in the editor, the preview, and the buttons.

### Cost and safety
- Curated model menu: Claude Haiku 5.5 (default), GPT-6 Luna, and Claude Sonnet 5.5. The API rejects any other model, so the demo key cannot be pointed at an expensive one.
- Cost of the last request and of the session in the footer, plus the remaining demo budget.
- Requests stop when the shared key has less than $0.50 left.
- Whole-document edits are capped at 20,000 characters.
- Translation cache: repeating a translation is free, and translating back restores the original text without calling the model.
- Server errors are codes, shown in the interface language. Upstream details stay in the server logs.

### Development
- `MOCK_AI=1` runs without a key. Suggestions are deterministic fakes, and translations of the sample document are canned copies.
- Deployed on Vercel. `OPENROUTER_API_KEY` is set as a production secret.

## Unreleased

### Added
- Translation cache. The server keeps up to 200 translations in instance memory, keyed by model, target language, and text. A repeat costs nothing and returns in milliseconds. Failed translations are never cached.
- Translating back to the previous language restores the original text in the browser, with no API call.

## 2026-10-30

### Added
- Interface language switch for pt-BR, en-US, es-AR, and zh-CN (`2de53c7`).
- "Text language" selector that translates the document with the co-author (`2de53c7`).
- Localized error messages through server error codes (`2de53c7`).
- Canned translations of the sample document in mock mode (`2de53c7`).
- AI session transcripts in `.claude/` and `.grok/` (`e3b5343`).

### Fixed
- Haiku 5.5 returned long Chinese documents untranslated. The prompt now puts the instruction after the text (`61701f8`).
- Reject all after accepting some translation chunks left the document language out of date (`2de53c7`).
- A manual edit during review could switch the document language even when the translation was rejected (`2de53c7`).
- A failed translation discarded the suggestion that was under review (`2de53c7`).
- Mock mode replaced a selection that started with the sample title with the whole document (`2de53c7`).
- Validation and upstream errors showed raw English text under other interface languages (`2de53c7`).

### Changed
- Translating a document over the length limit shows a translation-specific message (`2de53c7`).
- Chunk buttons are labelled through CodeMirror phrases instead of a custom button builder (`2de53c7`).
- Session logs and env files are kept out of Vercel uploads (`cd00467`).

## 2026-10-29

### Added
- Markdown editor with AI co-author: CodeMirror merge view, OpenRouter API route, curated models, demo budget guard, and mock mode (`41fe956`).
