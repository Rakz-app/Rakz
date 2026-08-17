// ========== src/agent/prompt-templates.ts ==========
// The one salvageable piece of the parked prompt-engine draft (see
// drafts/prompt-engine.ts for the original and WHY the rest cannot run):
// placeholder substitution, rewritten against the REAL Memonic fields.
// Templates live in code (or localStorage later) — NEVER in .mns files;
// the wire format stays untouched.
//
// Placeholders: {{title}} {{context}} {{tags}} {{type}} {{importance}}
//   {{summary}}   → alias of context (the draft's `summary` field doesn't exist)
//   {{selection}} → whatever text the UI hands in (was: {{noteContent}})

import type { Memonic } from "@engine/types";

export function fillPromptTemplate(
  template: string,
  memonic: Memonic,
  selectionText: string
): string {
  return template
    .replace(/\{\{context\}\}/g, memonic.context)
    .replace(/\{\{summary\}\}/g, memonic.context)
    .replace(/\{\{title\}\}/g, memonic.title)
    .replace(/\{\{selection\}\}/g, selectionText)
    .replace(/\{\{tags\}\}/g, memonic.tags.join(", "))
    .replace(/\{\{type\}\}/g, memonic.type)
    .replace(/\{\{importance\}\}/g, String(memonic.importance));
}
