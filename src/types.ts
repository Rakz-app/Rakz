export type MemonicType =
  | "shortcut"
  | "story"
  | "song"
  | "rule"
  | "fact"
  | "example"
  | "question"
  | "tip"
  | (string & {});

export type MemonicStrength = 1 | 2 | 3 | 4 | 5;

export type MemonicSource =
  | { type: "user" }
  | { type: "ai"; model: string }
  | { type: "shared"; from: string }
  | { type: "template" };

export type TriggerMode = "auto" | "manual" | "hybrid";

export interface PromptTemplate {
  id: string;
  label: string;
  template: string;
}

export interface AIConfig {
  providerId: "openrouter";
  model: string;
  systemPrompt?: string;
  temperature?: number;
}

export type MemonicStatus = "active" | "archived" | "deleted";

export interface Memonic {
  id: string;
  title: string;
  type: MemonicType;
  context: string;
  summary?: string;
  strength: MemonicStrength;
  source: MemonicSource;
  status: MemonicStatus;
  reference?: boolean;
  // Stable, unique system identity (never shown to the user). Survives title
  // renames, visible-id edits, and file moves. This is the real store key.
  sid: number;
  bid: number;
  tags: string[];
  folderPath: string;
  sourceFile?: string;
  aiConfig: AIConfig;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  suggestionBehavior: {
    triggerMode: TriggerMode;
    triggerKeywords: string[];
    promptTemplates: PromptTemplate[];
    priority: number;
  };
}

export interface AIProvider {
  id: "openrouter";
  label: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  defaultSystemPrompt: string;
}

export type RestoreMode = "callout" | "codeblock";

export interface PluginSettings {
  aiProvider: AIProvider;
  memonics: Memonic[];
  nextMemonicNumber: number;
  nextSid: number;
  restoreMode: RestoreMode;
  copyIsMove: boolean;
  debrisCleanup: boolean;
  autoId: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  aiProvider: {
    id: "openrouter",
    label: "OpenRouter",
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-haiku",
      "google/gemini-2.0-flash-001",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    defaultModel: "openai/gpt-4o-mini",
    defaultSystemPrompt: "You are a helpful assistant for note-taking.",
  },
  memonics: [],
  nextMemonicNumber: 1,
  nextSid: 1,
  restoreMode: "callout",
  copyIsMove: false,
  debrisCleanup: false,
  autoId: true,
};
