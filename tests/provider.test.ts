import { MockProvider } from '../src/infrastructure/runtime/mock_provider';
import { ClaudeProvider } from '../src/infrastructure/runtime/claude_provider';
import { ProcessRuntime } from '../src/infrastructure/runtime/process_runtime';
import { DiContainer } from '../src/infrastructure/di/di_container';
import { ConfigLoader } from '../src/infrastructure/config/config_loader';
import { IProvider } from '../src/core/domain/interfaces/iprovider';

describe('AI Provider Abstraction', () => {
  let runtime: ProcessRuntime;

  beforeEach(() => {
    runtime = new ProcessRuntime();
  });

  it('should successfully run MockProvider and stream output', async () => {
    const provider = new MockProvider(runtime);
    expect(provider.providerName()).toBe('mock');

    const chunks: string[] = [];
    const result = await provider.stream('test prompt', (chunk) => {
      chunks.push(chunk);
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(chunks.join('')).toContain('RESPONSE');
  });

  it('should resolve the correct provider from DI based on config loader', () => {
    const container = new DiContainer();

    // 1. Mock provider configuration
    process.env.PROVIDER_TYPE = 'mock';
    const configMock = new ConfigLoader();
    let providerMock: IProvider;
    if (configMock.get().providerType === 'claude') {
      providerMock = new ClaudeProvider(runtime);
    } else {
      providerMock = new MockProvider(runtime);
    }
    container.register<IProvider>('Provider', providerMock);
    
    const resolvedMock = container.resolve<IProvider>('Provider');
    expect(resolvedMock.providerName()).toBe('mock');

    // 2. Claude provider configuration
    const containerClaude = new DiContainer();
    process.env.PROVIDER_TYPE = 'claude';
    process.env.CLAUDE_EXECUTABLE = 'claude-test-binary';
    const configClaude = new ConfigLoader();
    let providerClaude: IProvider;
    if (configClaude.get().providerType === 'claude') {
      providerClaude = new ClaudeProvider(runtime, configClaude.get().claudeExecutable);
    } else {
      providerClaude = new MockProvider(runtime);
    }
    containerClaude.register<IProvider>('Provider', providerClaude);

    const resolvedClaude = containerClaude.resolve<IProvider>('Provider');
    expect(resolvedClaude.providerName()).toBe('claude');

    // Restore env defaults to prevent leaking into other tests
    delete process.env.PROVIDER_TYPE;
    delete process.env.CLAUDE_EXECUTABLE;
  });
});
