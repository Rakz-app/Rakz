# MnemoTree

![GitHub release](https://img.shields.io/github/v/release/Abdelrhman-Hammoudeh/obsidian-mnemo-tree?style=flat-square)
![Codeberg release](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcodeberg.org%2Fapi%2Fv1%2Frepos%2FaboodAG%2Fobsidian-mnemo-tree%2Freleases%2Flatest&query=%24.tag_name&label=Codeberg&color=%232185D0&style=flat-square)
![License](https://img.shields.io/badge/license-GPLv3-blue?style=flat-square)
![Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22mnemo-tree%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=flat-square)

Memory mnemonics (memonics) tree for Obsidian.

Turn knowledge into structured, searchable callouts embedded in your notes. Tag them, rate their strength, trigger AI suggestions, and never lose track of what you've learned.

## Features

- **Memonic Callouts** — structured knowledge snippets embedded directly in your Markdown notes
- **Dual Identity** — stable hidden `sid` (never reused) + editable visible `id` — no more duplicate conflicts
- **sid-Based File Matching** — all callout operations (edit, delete, restore, navigate, AI apply) locate callouts by their stable `sid` comment, not by the editable `id` line — so rename, empty-id, and duplicate-id scenarios all work correctly
- **AI Integration** — per-memonic OpenRouter model config, AI suggest button, mental-link (:) generator
- **Suggestion Panel** — auto-matches memonics to your active note by keywords, tags, and folder
- **Glossary Sidebar** — filter, sort, group, search; show/hide trash & archived; card-based management
- **Vault Reconcile** — detect moved, missing, and new memonics; archive duplicate IDs; show a report
- **Move & Restore** — move memonics between files, restore from trash to any location
- **Reference Copies** — insert `memonic-ref` code blocks that won't conflict with originals
- **Soft Delete & Trash** — deleted memonics go to trash (recoverable), force delete (!!!) with confirmation
- **Robust Error Handling** — 30-second timeout on AI requests, clear error messages for auth failures, rate limits, and network issues

## Requirements

- An [OpenRouter](https://openrouter.ai/) API key (required only for AI features — the rest of the plugin works without it).
- AI requests consume OpenRouter credits. Costs depend on the model you choose; `openai/gpt-4o-mini` (the default) is low-cost. You are billed by OpenRouter directly.
- Desktop recommended. Mobile is untested — enable at your own risk.

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Copy them into `<vault>/.obsidian/plugins/mnemo-tree/`
3. Enable the plugin in Obsidian Settings → Community Plugins

### BRAT

Add this repository to [BRAT](https://github.com/TfTHacker/obsidian-brat) and install from there. Supports both [GitHub](https://github.com/Abdelrhman-Hammoudeh/obsidian-mnemo-tree) and [Codeberg](https://codeberg.org/aboodAG/obsidian-mnemo-tree) mirrors.

## Quick Start

1. Open **Settings → MnemoTree** and enter your [OpenRouter](https://openrouter.ai/) API key
2. Open the **Memonic Glossary** sidebar (ribbon book icon or command palette)
3. Click **+ New Memonic** or run **Insert Memonic Template** from the command palette
4. Your memonics are auto-discovered when you edit or save files

## Memonic Callout Syntax

```markdown
> [!memonic|shortcut] Title Here
> id: 1
> <!-- sid: 7 -->
> strength: 3
> tags: tag1, tag2
> triggers: keyword1, keyword2
> Summary: One-line summary
> ---
> Your context / knowledge goes here...
```

| Line | Description |
|---|---|
| `> [!memonic\|TYPE] TITLE` | Callout header — TYPE is one of the built-in types or any custom string |
| `> id: N` | Visible numeric label (omitted when auto-id is off or id is empty) |
| `> <!-- sid: N -->` | Hidden stable identity — never edited manually; used by all file operations |
| `> strength: 1–5` | Importance rating |
| `> tags: ...` | Comma-separated tags |
| `> triggers: ...` | Comma-separated keywords for suggestion matching |
| `> Summary: ...` | One-line summary |
| `> ---` | Separator between metadata and body |
| Body lines | Context / knowledge text, each prefixed with `> ` |

### Memonic Types

`shortcut` · `story` · `song` · `rule` · `fact` · `example` · `question` · `tip` · or any custom type

### Reference Copies

Use **Insert Memonic Reference** to embed a safe read-only copy of a memonic in another note:

~~~markdown
```memonic-ref
> [!memonic|shortcut] Title
> id: 1
> <!-- sid: 7 -->
> strength: 3
> tags: tag1, tag2
> triggers: keyword1, keyword2
> ---
> Context text
```
~~~

Reference copies are skipped by the parser — they never create duplicates or write to the store.

## Commands

| Command | Description |
|---|---|
| **Open Memonic Glossary** | Open the glossary sidebar |
| **Open Suggestion Panel** | Open the AI suggestion sidebar |
| **Scan Vault for Memonic Callouts** | Full vault scan — discover and update all memonics |
| **Refresh & Reconcile Vault Memonics** | Full scan + detect orphans, archive duplicate IDs, show report |
| **Insert Memonic Template** | Insert a blank memonic callout at cursor |
| **Insert Memonic Reference** | Fuzzy-search and insert a `memonic-ref` code block |
| **Refresh Memonic Glossary** | Re-render the glossary sidebar |

## Glossary Sidebar

### Card Actions (Active Memonics)

| Button | Action |
|---|---|
| → (Open source) | Navigate to the callout in its file |
| Clipboard | Copy callout (or Move if Copy=Move is on, with Undo) |
| 📂 (Move) | Move memonic to another file/folder |
| AI | AI suggest improvements (title, summary, tags, triggers) |
| :) | AI mental-link generator |
| 🗑 (Delete) | Soft-delete — moves to trash (recoverable) |

### Card Actions (Deleted Memonics — Trash)

| Button | Action |
|---|---|
| Restore memonic | Re-append callout to original file |
| Restore to folder... | Pick a target file/folder |
| Delete Forever | Permanently remove from store |

### Card Actions (Bottom Row — Non-Deleted)

| Button | Action |
|---|---|
| !!! | Force delete from store (requires double-click confirmation) |

### Header Buttons

| Button | Action |
|---|---|
| ⟳ (Refresh) | Re-render the glossary from the current store |
| ⟳· (Reconcile) | Full vault reconcile — scan, detect orphans, archive duplicates, show report |

### Stats Bar Toggles

- **Show trash (N)** — toggle visibility of deleted memonics
- **Show archived (N)** — toggle visibility of archived memonics

## AI Features

### AI Suggest Button

Sends the memonic's context, type, tags, and triggers to OpenRouter and returns a JSON suggestion:
```json
{ "title": "improved title", "summary": "improved summary", "tags": [...], "triggers": [...] }
```
Apply individually or all at once via the AI Result Modal.

### Mental-Link Generator (:) Button

Asks the AI to craft a vivid, memorable title (mental link) and one-line summary from the memonic's context.

### Suggestion Panel

Ranks memonics against the active note by:
```
score = (keywordMatches × 10) + (tagMatches × 5) + (priority × 3) + (strength × 2) − min(usageCount, 20)
```

Shows up to 10 matching memonics. Click **Run** to send the memonic's prompt template to OpenRouter, or **Eye** to preview the resolved prompt.

## Vault Reconcile

The **Reconcile** button (⟳· in the glossary header) performs a full vault scan with extra reconciliation:

1. Scans all Markdown files for memonic callouts
2. Detects **orphaned memonics** (active in store but callout missing from any file) → moves to trash
3. Resolves **duplicate visible IDs** → archives older copies
4. Shows a report notice:
   - **Moved to trash (recoverable):** N — callouts that disappeared
   - **New:** N — newly discovered callouts
   - **Moved:** N — callouts whose source file changed
   - **Conflicts archived:** N — older duplicates archived

The regular ⟳ button only re-renders the view; Reconcile does the heavy lifting.

## Settings

| Setting | Default | Description |
|---|---|---|
| OpenRouter API Key | — | Required for AI features |
| Default Model | `openai/gpt-4o-mini` | Model used when no per-memonic override |
| Restore Mode | Callout | Restore deleted memonics as callouts or `memonic-ref` code blocks |
| Copy = Move | Off | When on, copying a callout removes it from the source file |
| Debris Cleanup | Off | When on, deleting a memonic also removes it from store if callout is missing |
| Auto-number ID | On | Auto-assign visible numeric IDs to new memonics |

## Dual Identity System

Each memonic has two identifiers:

- **`sid` (system id)** — stable, monotonic, never reused. Anchors identity across renames, copies, and file moves. Hidden from the user in an HTML comment. **All file operations (edit, delete, restore, navigate, AI apply) locate callouts by `sid`**, ensuring correctness even when the visible `id` is empty or duplicated.
- **`id` (visible id)** — user-facing label like `mem-1`. Freely editable; multiple memonics may share the same visible id (resolved by archiving older copies). Omitted from the callout when empty.

This eliminates the old duplicate-ID problem: copying a callout to another note mints a new `sid`, so both coexist independently.

## Changelog

### v1.0.0

- **[Critical fix]** All callout file operations (edit, delete, restore, navigate, AI suggest/replace) now locate callouts by their stable `sid` (`<!-- sid: N -->`) instead of the editable `id` line. This fixes failures when `id` is empty, duplicated, or edited by the user.
- **[Fix]** `navigateToMemonic` now matches by `sid` inside the callout body instead of by title — prevents navigation to the wrong callout when titles overlap.
- **[Fix]** `formatMemonicCallout` now omits the `> id:` line when the visible id is empty, matching `buildMemonicCallout` behavior and preventing orphan empty-id lines.
- **[Fix]** `MemonicCreateModal` click-outside handler is now properly cleaned up on close, preventing a memory/event leak.
- **[Improvement]** AI request timeout (30s) and descriptive error messages for auth failures, rate limits, and network issues.
- **[Cleanup]** Removed dead code: `runSuggestion`, `incrementUsage` (id-based), `nextBid` counter, and `getNextBid` parameter.
- **[License]** Changed from MIT to GPLv3.

## Privacy & Data

- **Local-first:** all your memonics are stored locally in your vault (`.obsidian/plugins/mnemo-tree/data.json`). Nothing is uploaded anywhere by default.
- **AI features only:** when you explicitly trigger an AI action (Suggest, Mental-Link, or a Suggestion-Panel run), the relevant memonic content (title, context, tags, triggers) is sent to **OpenRouter** to generate a response. No data is sent unless you trigger these actions.
- **Your API key** is stored locally in `data.json` and is sent only to OpenRouter's API to authenticate your requests. It is never transmitted anywhere else.
- **No telemetry:** this plugin collects no analytics and phones home to no servers other than OpenRouter (and only for the AI features above).

> **Security reminder:** `data.json` contains your API key and all your memonics. Make sure it's in `.gitignore` and never committed to the repository. If it was ever committed, revoke your key on OpenRouter and generate a new one.

## License

GPLv3 — see [LICENSE](LICENSE).