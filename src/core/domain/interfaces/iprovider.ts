export interface ProviderResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number | null;
  durationMs: number;
}

export interface IProvider {
  execute(prompt: string): Promise<ProviderResult>;
  stream(prompt: string, onChunk: (chunk: string) => void): Promise<ProviderResult>;
  cancel(): void;
  providerName(): string;
}
