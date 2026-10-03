// AI provider abstraction for idm-ai-agent: Anthropic (primary - the one
// provider actually exercised against this project's live data) and
// OpenAI (available, selected via the AI_PROVIDER secret, but NOT
// independently verified in this environment - no OPENAI_API_KEY secret is
// configured here, so its request/response mapping has only been reviewed
// by reading, not exercised against a real response. Review it carefully
// before relying on it in production).
//
// The canonical Message/ContentBlock shape below is intentionally close to
// Anthropic's own Messages API, since that's the primary, tested provider
// - AnthropicProvider is close to a pass-through, and OpenAIProvider does
// the (two-way) translation instead of adding complexity to the shared
// orchestration loop in index.ts.

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface AgentMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ProviderTurn {
  content: ContentBlock[];
  stopReason: "tool_use" | "end_turn" | "other";
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  createMessage(params: {
    system: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
    maxTokens: number;
  }): Promise<ProviderTurn>;
}

function anthropicBlockFrom(block: ContentBlock): Record<string, unknown> {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.type === "image") {
    return { type: "image", source: { type: "base64", media_type: block.mediaType, data: block.data } };
  }
  if (block.type === "tool_use") return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  return {
    type: "tool_result",
    tool_use_id: block.toolUseId,
    content: block.content,
    ...(block.isError ? { is_error: true } : {}),
  };
}

function anthropicBlockTo(block: Record<string, unknown>): ContentBlock {
  if (block.type === "text") return { type: "text", text: String(block.text ?? "") };
  if (block.type === "tool_use") {
    return {
      type: "tool_use",
      id: String(block.id ?? ""),
      name: String(block.name ?? ""),
      input: (block.input as Record<string, unknown>) ?? {},
    };
  }
  return { type: "text", text: "" };
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  constructor(private apiKey: string, readonly model: string) {}

  async createMessage(params: {
    system: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
    maxTokens: number;
  }): Promise<ProviderTurn> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content.map(anthropicBlockFrom) })),
        tools: params.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic-Fehler: ${await res.text()}`);
    const data = await res.json();
    const content: ContentBlock[] = (data.content ?? []).map(anthropicBlockTo);
    const stopReason = data.stop_reason === "tool_use" ? "tool_use" : data.stop_reason === "end_turn" ? "end_turn" : "other";
    return { content, stopReason };
  }
}

function toOpenAiMessages(system: string, messages: AgentMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      const toolResults = m.content.filter((b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result");
      const rest = m.content.filter((b) => b.type !== "tool_result");
      for (const tr of toolResults) {
        out.push({ role: "tool", tool_call_id: tr.toolUseId, content: tr.content });
      }
      if (rest.length > 0) {
        out.push({
          role: "user",
          content: rest.map((b) => {
            if (b.type === "text") return { type: "text", text: b.text };
            if (b.type === "image") return { type: "image_url", image_url: { url: `data:${b.mediaType};base64,${b.data}` } };
            return { type: "text", text: "" };
          }),
        });
      }
    } else {
      const textBlock = m.content.find((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text");
      const toolUses = m.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      out.push({
        role: "assistant",
        content: textBlock?.text ?? null,
        ...(toolUses.length > 0
          ? {
              tool_calls: toolUses.map((t) => ({
                id: t.id,
                type: "function",
                function: { name: t.name, arguments: JSON.stringify(t.input) },
              })),
            }
          : {}),
      });
    }
  }
  return out;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  constructor(private apiKey: string, readonly model: string) {}

  async createMessage(params: {
    system: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
    maxTokens: number;
  }): Promise<ProviderTurn> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: params.maxTokens,
        messages: toOpenAiMessages(params.system, params.messages),
        tools: params.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        })),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI-Fehler: ${await res.text()}`);
    const data = await res.json();
    const message = data.choices?.[0]?.message ?? {};
    const content: ContentBlock[] = [];
    if (typeof message.content === "string" && message.content) content.push({ type: "text", text: message.content });
    for (const call of message.tool_calls ?? []) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.function?.arguments || "{}");
      } catch {
        // Left empty - the tool executor's own input validation rejects it.
      }
      content.push({ type: "tool_use", id: String(call.id ?? ""), name: String(call.function?.name ?? ""), input });
    }
    const finishReason = data.choices?.[0]?.finish_reason;
    const stopReason = finishReason === "tool_calls" ? "tool_use" : finishReason === "stop" ? "end_turn" : "other";
    return { content, stopReason };
  }
}

export function createProvider(env: {
  AI_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}): AIProvider {
  const providerName = (env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (providerName === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ist nicht konfiguriert.");
    return new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL ?? "gpt-4o");
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");
  return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL ?? "claude-sonnet-5");
}
