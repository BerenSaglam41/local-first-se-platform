export interface InferenceRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface InferenceResponse {
  rawOutput: string;
  codeBlocks: { fileName?: string; content: string; language?: string }[];
  durationMs: number;
}

export interface IAIAdapter {
  getAdapterName(): string;
  sendInferenceRequest(request: InferenceRequest): Promise<InferenceResponse>;
}
