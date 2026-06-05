import { AIProvider, Memonic } from "./types";

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface OpenRouterResponse {
  id: string;
  choices: {
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    code: number;
  };
}

const OPENROUTER_TIMEOUT_MS = 30000;

export async function queryOpenRouter(
  provider: AIProvider,
  model: string,
  systemPrompt: string,
  userMessage: string,
  memonics: Memonic[],
  temperature?: number
): Promise<string> {
  if (!provider.apiKey) {
    throw new Error("OpenRouter API key is not set. Configure it in settings.");
  }

  const memonicContext = memonics
    .map(
      (m) =>
        `[${m.type.toUpperCase()}] ${m.title}:\n${m.context}`
    )
    .join("\n\n---\n\n");

  const fullSystemPrompt = memonicContext
    ? `${systemPrompt}\n\nRelevant context:\n${memonicContext}`
    : systemPrompt;

  const requestBody: OpenRouterRequest = {
    model,
    messages: [
      { role: "system", content: fullSystemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: temperature ?? 0.7,
    max_tokens: 2000,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
        "HTTP-Referer": "https://obsidian.md",
        "X-Title": "Obsidian AI Memonics Plugin",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        errorBody = "(unable to read error body)";
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`API key rejected (${response.status}). Please check your OpenRouter API key in settings.`);
      }
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please wait a moment and try again.");
      }
      if (response.status >= 500) {
        throw new Error(`OpenRouter server error (${response.status}). Please try again later.`);
      }
      throw new Error(
        `OpenRouter API error (${response.status}): ${errorBody}`
      );
    }

    let data: OpenRouterResponse;
    try {
      data = await response.json();
    } catch {
      throw new Error("Failed to parse response from OpenRouter. The server may be experiencing issues.");
    }

    if (data.error) {
      throw new Error(
        `OpenRouter error: ${data.error.message} (code ${data.error.code})`
      );
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content && content !== "") {
      throw new Error("OpenRouter returned an empty response. Try a different model or prompt.");
    }

    return content;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`AI request timed out after ${OPENROUTER_TIMEOUT_MS / 1000}s. The model may be slow — try again or use a faster model.`);
    }
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error("Network error: unable to reach OpenRouter. Check your internet connection.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listAvailableModels(
  provider: AIProvider
): Promise<string[]> {
  if (!provider.apiKey) {
    return provider.models;
  }

  try {
    const response = await fetch(`${provider.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
      },
    });

    if (!response.ok) {
      return provider.models;
    }

    const data = await response.json();
    return (data.data || []).map((m: any) => m.id);
  } catch {
    return provider.models;
  }
}
