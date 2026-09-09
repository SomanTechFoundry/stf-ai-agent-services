/**
 * Anthropic Claude provider — skeleton for future implementation.
 * Phase 3+ only.
 */

import type {
  AIProvider,
  AICompletionRequest,
  AICompletionResponse,
} from "@/lib/ai/types";
import { AppError, ErrorCode } from "@/lib/errors";

export class AnthropicProvider implements AIProvider {
  readonly providerName = "anthropic";
  readonly modelName: string;

  constructor(_apiKey: string, model = "claude-3-haiku-20240307") {
    this.modelName = model;
  }

  async complete(_request: AICompletionRequest): Promise<AICompletionResponse> {
    throw new AppError(
      ErrorCode.AI_PROVIDER_ERROR,
      "Anthropic provider not yet implemented",
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
