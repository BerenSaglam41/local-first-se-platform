export interface ProviderCapabilities {
  supportsStreaming: boolean;
  maxContextTokens: number;
  isLocal: boolean;
  modelName: string;
}

export interface ProviderExecutionRequest {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderExecutionResponse {
  textOutput: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd?: number;
  };
}

export interface IProviderAdapter {
  getCapabilities(): ProviderCapabilities;
  execute(request: ProviderExecutionRequest): Promise<ProviderExecutionResponse>;
  executeStream?(
    request: ProviderExecutionRequest,
    onChunk: (text: string) => void
  ): Promise<ProviderExecutionResponse>;
}
