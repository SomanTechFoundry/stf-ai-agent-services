/**
 * Google Gemini AI provider — full implementation with internal tool loop.
 *
 * Gemini "thinking" models (3.x series) embed a thought_signature in every
 * function call response. If you reconstruct chat history manually across
 * separate API calls, the thought_signature is stripped and the API returns
 * a 400 error on the next tool-calling turn.
 *
 * Fix: Run the ENTIRE tool-calling loop inside a single ChatSession so the
 * SDK preserves thought_signatures automatically in its internal history.
 *
 * Streaming note: sendMessageStream() cannot be used for tool-call turns
 * because the streaming endpoint does not return thought_signatures in the
 * per-chunk payloads. When the chat history is updated from stream chunks
 * the thought_signature is lost, causing subsequent calls to fail with:
 * "Please ensure that function response turn comes immediately after a
 * function call turn."
 *
 * Instead, stream() uses sendMessage() (non-streaming) for ALL turns and
 * delivers the final text to onChunk as a single payload. The client
 * animates it locally with a typewriter effect for smooth UX.
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  SchemaType,
  type Content,
  type Tool,
  type FunctionDeclaration,
  type Part,
  type FunctionCall,
} from "@google/generative-ai";

import type {
  AIProvider,
  AICompletionRequest,
  AICompletionResponse,
  AIMessage,
  AIToolCall,
  AIToolDefinition,
  ToolExecutor,
} from "@/lib/ai/types";
import { AppError, ErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logger";

const MAX_INTERNAL_ITERATIONS = 6;

type ChatSession = ReturnType<
  ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["startChat"]
>;

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

export class GeminiProvider implements AIProvider {
  readonly providerName = "gemini";
  readonly modelName: string;
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string, model = "gemini-3.1-flash-lite") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = model;
  }

  // ============================================================
  // complete() — non-streaming, full response returned at once
  // ============================================================

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const startMs = Date.now();
    try {
      const { chat, currentParts } = this.startSession(request);

      if (request.toolExecutor && request.tools?.length) {
        return await this.runToolLoop(chat, currentParts, request.toolExecutor, undefined, startMs);
      }

      const result = await chat.sendMessage(currentParts);
      return this.buildSingleTurnResponse(result.response, startMs);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ============================================================
  // stream() — delivers final text via onChunk, tools run sync
  //
  // Uses sendMessage() internally (same as complete()) to avoid
  // the thought_signature issue with sendMessageStream(). The
  // client receives the full text as a single onChunk call and
  // renders it with a local typewriter animation.
  // ============================================================

  async stream(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!request.onChunk) {
      return this.complete(request);
    }

    const startMs = Date.now();
    try {
      const { chat, currentParts } = this.startSession(request);

      if (request.toolExecutor && request.tools?.length) {
        return await this.runToolLoop(
          chat,
          currentParts,
          request.toolExecutor,
          request.onChunk,
          startMs
        );
      }

      // Single-turn: no tools — just complete and deliver via onChunk
      const result = await chat.sendMessage(currentParts);
      const text = this.safeText(result.response);
      if (text) request.onChunk(text);
      return this.buildSingleTurnResponse(result.response, startMs);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ============================================================
  // healthCheck
  // ============================================================

  async healthCheck(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: this.modelName });
      const result = await model.generateContent("ping");
      return !!result.response.text();
    } catch {
      return false;
    }
  }

  // ============================================================
  // Internal tool loop — always uses sendMessage() for all turns
  // so thought_signatures are preserved in the ChatSession history.
  // ============================================================

  private async runToolLoop(
    chat: ChatSession,
    initialParts: Part[],
    toolExecutor: ToolExecutor,
    onChunk: ((text: string) => void) | undefined,
    startMs: number
  ): Promise<AICompletionResponse> {
    let parts: Part[] = initialParts;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const allToolCalls: AIToolCall[] = [];

    for (let i = 0; i < MAX_INTERNAL_ITERATIONS; i++) {
      const result = await chat.sendMessage(parts);
      const response = result.response;
      const usage = response.usageMetadata;
      totalInputTokens += usage?.promptTokenCount ?? 0;
      totalOutputTokens += usage?.candidatesTokenCount ?? 0;

      const functionCalls = this.safeFunctionCalls(response);

      // No function calls → final text response
      if (functionCalls.length === 0) {
        const fullText = this.safeText(response);
        // Deliver to onChunk as a single payload; the client renders a
        // local typewriter animation so the UX still feels progressive.
        onChunk?.(fullText);
        return {
          message: { role: "assistant", content: fullText },
          toolCalls: allToolCalls.length ? allToolCalls : undefined,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          stopReason: "stop",
          provider: this.providerName,
          model: this.modelName,
          durationMs: Date.now() - startMs,
        };
      }

      // Map Gemini function calls → typed AIToolCall
      const typedCalls: AIToolCall[] = functionCalls.map((fc, idx) => ({
        id: `${fc.name}-${i}-${idx}-${Date.now()}`,
        name: fc.name,
        arguments: fc.args as Record<string, unknown>,
      }));
      allToolCalls.push(...typedCalls);

      // Execute tools via callback — stays in the same ChatSession
      const toolResults = await toolExecutor(typedCalls);

      parts = toolResults.map((tr) => {
        const call = typedCalls.find((c) => c.id === tr.toolCallId) ?? typedCalls[0];
        return {
          functionResponse: {
            name: call.name,
            response: { result: tr.result },
          },
        } as Part;
      });
    }

    // Exhausted iterations fallback
    const fallbackText = "I've gathered the information needed. How else can I help you?";
    onChunk?.(fallbackText);
    return {
      message: { role: "assistant", content: fallbackText },
      toolCalls: allToolCalls.length ? allToolCalls : undefined,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      stopReason: "max_tokens",
      provider: this.providerName,
      model: this.modelName,
      durationMs: Date.now() - startMs,
    };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private startSession(request: AICompletionRequest): {
    chat: ChatSession;
    currentParts: Part[];
  } {
    const tools = request.tools ? this.buildTools(request.tools) : undefined;

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: request.systemPrompt,
      tools,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      },
    });

    const allMessages = request.messages.filter((m) => m.role !== "system");
    const history = allMessages.slice(0, -1);
    const lastMessage = allMessages[allMessages.length - 1];

    if (!lastMessage) {
      throw new AppError(ErrorCode.AI_PROVIDER_ERROR, "No messages provided", 400);
    }

    const chat = model.startChat({
      history: history.map((m) => this.toGeminiContent(m)),
    });
    const currentParts = this.buildCurrentParts(lastMessage);
    return { chat, currentParts };
  }

  private buildSingleTurnResponse(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: any,
    startMs: number
  ): AICompletionResponse {
    const usage = response.usageMetadata;
    const durationMs = Date.now() - startMs;
    const functionCalls = this.safeFunctionCalls(response);

    if (functionCalls.length) {
      const toolCalls: AIToolCall[] = functionCalls.map(
        (fc: FunctionCall, i: number) => ({
          id: `${fc.name}-${i}-${Date.now()}`,
          name: fc.name,
          arguments: fc.args as Record<string, unknown>,
        })
      );
      return {
        message: { role: "assistant", content: "", toolCalls },
        toolCalls,
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
        },
        stopReason: "tool_calls",
        provider: this.providerName,
        model: this.modelName,
        durationMs,
      };
    }

    return {
      message: { role: "assistant", content: this.safeText(response) },
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
      stopReason: "stop",
      provider: this.providerName,
      model: this.modelName,
      durationMs,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private safeText(response: any): string {
    try {
      return response.text() ?? "";
    } catch {
      return "";
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private safeFunctionCalls(response: any): FunctionCall[] {
    try {
      return response.functionCalls() ?? [];
    } catch {
      return [];
    }
  }

  private handleError(err: unknown): never {
    if (err instanceof AppError) throw err;
    logger.error("Gemini API error", err);
    throw new AppError(
      ErrorCode.AI_PROVIDER_ERROR,
      "The AI service is temporarily unavailable. Please try again.",
      502,
      { cause: err instanceof Error ? err : undefined }
    );
  }

  private toGeminiContent(message: AIMessage): Content {
    if (message.role === "assistant") {
      if (message.toolCalls?.length) {
        return {
          role: "model",
          parts: message.toolCalls.map((tc) => ({
            functionCall: { name: tc.name, args: tc.arguments },
          })),
        };
      }
      return { role: "model", parts: [{ text: message.content }] };
    }
    if (message.role === "tool") {
      return {
        role: "function",
        parts: [
          {
            functionResponse: {
              name: message.toolCallId ?? "tool_result",
              response: { result: message.content },
            },
          },
        ],
      };
    }
    return { role: "user", parts: [{ text: message.content }] };
  }

  private buildCurrentParts(message: AIMessage): Part[] {
    return [{ text: message.content || "Please continue." }];
  }

  private buildTools(toolDefs: AIToolDefinition[]): Tool[] {
    const functionDeclarations = toolDefs.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: t.parameters.properties as Record<string, unknown>,
        required: t.parameters.required ?? [],
      },
    })) as FunctionDeclaration[];
    return [{ functionDeclarations }];
  }
}
