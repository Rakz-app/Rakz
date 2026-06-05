# AI Memonics

AI-powered memory mnemonics (memonics) for Obsidian.

Turn knowledge into structured, searchable callouts embedded in your notes. Tag them, rate their strength, trigger AI suggestions, and never lose track of what you've learned.

## Features

- **Memonic Callouts** — structured knowledge snippets embedded directly in your Markdown notes
- **Dual Identity** — stable hidden `sid` (never reused) + editable visible `id` — no more duplicate conflicts
- **AI Integration** — per-memonic OpenRouter model config, AI suggest button, mental-link (:) generator
- **Suggestion Panel** — auto-matches memonics to your active note by keywords, tags, and folder
- **Glossary Sidebar** — filter, sort, group, search; show/hide trash & archived; card-based management
- **Vault Reconcile** — detect moved, missing, and new memonics; archive duplicate IDs; show a report
- **Move & Restore** — move memonics between files, restore from trash to any location
- **Reference Copies** — insert `memonic-ref` code blocks that won't conflict with originals
- **Soft Delete & Trash** — deleted memonics go to trash (recoverable), force delete (!!!) with confirmation

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Copy them into `<vault>/.obsidian/plugins/ai-memonics/`
3. Enable the plugin in Obsidian Settings → Community Plugins

### BRAT

Add this repository to [BRAT](https://github.com/TfTHacker/obsidian-brat) and install from there.

## Quick Start

1. Open **Settings → AI Memonics** and enter your [OpenRouter](https://openrouter.ai/) API key
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
| `> id: N` | Visible numeric label (omitted if auto-id is off) |
| `> <!-- sid: N -->` | Hidden stable identity — never edited manually |
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

### Mental-Link Generator (:) Button)

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

- **`sid` (system id)** — stable, monotonic, never reused. Anchors identity across renames, copies, and file moves. Hidden from the user in an HTML comment.
- **`id` (visible id)** — user-facing label like `mem-1`. Freely editable; multiple memonics may share the same visible id (resolved by archiving older copies).

This eliminates the old duplicate-ID problem: copying a callout to another note mints a new `sid`, so both coexist independently.

## License

MIT