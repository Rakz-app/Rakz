import { Memonic, PromptTemplate } from "./types";
import {
  getAllMemonics,
  getMemonicsByFolder,
} from "./memoryStore";

export interface Suggestion {
  memonic: Memonic;
  template: PromptTemplate;
  score: number;
  matchType: "keyword" | "tag" | "folder";
}

export function findSuggestions(
  noteContent: string,
  folderPath: string
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const noteLower = noteContent.toLowerCase();
  const folderMemonics = getMemonicsByFolder(folderPath);

  const candidates = folderMemonics.length > 0
    ? folderMemonics
    : getAllMemonics();

  for (const memonic of candidates) {
    const { triggerMode, triggerKeywords, promptTemplates, priority } =
      memonic.suggestionBehavior;

    if (triggerMode === "manual") continue;

    const matchedKeywords = triggerKeywords.filter((kw) =>
      noteLower.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length === 0 && triggerMode === "auto") continue;

    const matchedTags = memonic.tags.filter((tag) =>
      noteLower.includes(tag.toLowerCase())
    );

    for (const template of promptTemplates) {
      const score = calculateScore(
        matchedKeywords.length,
        matchedTags.length,
        priority,
        memonic.strength,
        memonic.usageCount
      );

      const matchType = matchedKeywords.length > 0 ? "keyword" : matchedTags.length > 0 ? "tag" : "folder";

      suggestions.push({
        memonic,
        template,
        score,
        matchType,
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  return suggestions.slice(0, 10);
}

function calculateScore(
  keywordCount: number,
  tagCount: number,
  priority: number,
  strength: number,
  usageCount: number
): number {
  let score = 0;

  score += keywordCount * 10;
  score += tagCount * 5;
  score += priority * 3;
  score += strength * 2;
  score -= Math.min(usageCount, 20);

  return Math.max(score, 0);
}

export function fillPromptTemplate(
  template: string,
  memonic: Memonic,
  noteContent: string
): string {
  return template
    .replace(/\{\{context\}\}/g, memonic.context)
    .replace(/\{\{title\}\}/g, memonic.title)
    .replace(/\{\{summary\}\}/g, memonic.summary || memonic.context)
    .replace(/\{\{noteContent\}\}/g, noteContent)
    .replace(/\{\{tags\}\}/g, memonic.tags.join(", "))
    .replace(/\{\{type\}\}/g, memonic.type);
}
