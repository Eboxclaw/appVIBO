/**
 * LFM Unified Chat Client
 * Routes to local LFM (LEAP) or cloud providers based on active config.
 */

import {
  getActiveProvider,
  getActiveLocalModel,
  getLfmEndpoint,
  getCloudKeys,
  CLOUD_PROVIDERS,
  getDownloadedModels,
  type ActiveProvider,
} from "@/lib/models";

export interface LfmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT: LfmMessage = {
  role: "system",
  content: `You are ViBo Assistant, a private AI running locally via LFM. You help users organize notes, create tasks, and think through ideas. You are concise, helpful, and respect user privacy — all data stays on-device. If the user says "new note: <title>" or "new task: <title>", acknowledge it and confirm creation.`,
};

export function isLfmConfigured(): boolean {
  const provider = getActiveProvider();
  if (provider === "local") {
    return !!getLfmEndpoint() && getDownloadedModels().length > 0;
  }
  const keys = getCloudKeys();
  return !!(keys[provider]);
}

export function getActiveProviderLabel(): string {
  const provider = getActiveProvider();
  if (provider === "local") return "LFM Local";
  const found = CLOUD_PROVIDERS.find(p => p.id === provider);
  return found?.name || provider;
}

function getEndpointAndHeaders(provider: ActiveProvider): { url: string; headers: Record<string, string>; model?: string } {
  if (provider === "local") {
    const endpoint = getLfmEndpoint();
    return {
      url: `${endpoint.replace(/\/+$/, "")}/v1/chat/completions`,
      headers: { "Content-Type": "application/json" },
      model: getActiveLocalModel(),
    };
  }

  const keys = getCloudKeys();
  const providerConfig = CLOUD_PROVIDERS.find(p => p.id === provider);

  if (provider === "ollama") {
    const host = keys.ollama || "http://localhost:11434";
    return {
      url: `${host.replace(/\/+$/, "")}/v1/chat/completions`,
      headers: { "Content-Type": "application/json" },
    };
  }

  if (provider === "anthropic") {
    return {
      url: `${providerConfig?.baseUrl}/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": keys.anthropic || "",
        "anthropic-version": "2023-06-01",
      },
    };
  }

  // OpenRouter, Kimi, MiniMax — all OpenAI-compatible
  return {
    url: `${providerConfig?.baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${keys[provider] || ""}`,
    },
  };
}

/**
 * Stream a chat completion from the configured provider.
 */
export async function streamLfmChat({
  messages,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: LfmMessage[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}) {
  const provider = getActiveProvider();

  if (provider === "local" && !getLfmEndpoint()) {
    onError("LEAP server not configured. Go to Settings → Local Models to set the endpoint.");
    return;
  }

  const { url, headers, model } = getEndpointAndHeaders(provider);

  try {
    const body: any = {
      messages: [SYSTEM_PROMPT, ...messages],
      stream: true,
      max_tokens: 1024,
    };

    if (model) body.model = model;

    // Anthropic uses a different body format
    if (provider === "anthropic") {
      body.model = "claude-sonnet-4-20250514";
      body.system = SYSTEM_PROMPT.content;
      body.messages = messages.map(m => ({ role: m.role, content: m.content }));
    }

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      onError(`${getActiveProviderLabel()} error (${resp.status}): ${text || "Connection failed"}`);
      return;
    }

    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          // Handle both OpenAI and Anthropic streaming formats
          const content =
            parsed.choices?.[0]?.delta?.content ||
            parsed.delta?.text ||
            "";
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    onDone();
  } catch (err: any) {
    if (err.name === "AbortError") {
      onDone();
      return;
    }
    onError(`Cannot reach ${getActiveProviderLabel()}. Is it running?`);
  }
}
