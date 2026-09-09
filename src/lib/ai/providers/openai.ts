/**
 * OpenAI provider — skeleton for future implementation.
 * Phase 3+ only.
 */

import type {
  AIProvider,
  AICompletionRequest,
  AICompletionResponse,
} from "@/lib/ai/types";
import { AppError, ErrorCode } from "@/lib/errors";

export class OpenAIProvider implements AIProvider {
  readonly providerName = "openai";
  readonly modelName: string;

  constructor(_apiKey: string, model = "gpt-4o-mini") {
    this.modelName = model;
  }

  async complete(_request: AICompletionRequest): Promise<AICompletionResponse> {
    throw new AppError(
      ErrorCode.AI_PROVIDER_ERROR,
      "OpenAI provider not yet implemented",
      501
    );
  }

  async stream(request: AICompletionRequest): Promise<AICompletionResponse> {
    return this.complete(request);
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}
