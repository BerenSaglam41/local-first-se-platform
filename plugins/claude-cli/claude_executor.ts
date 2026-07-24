import { ClaudeSession } from './claude_session';

export interface KernelExecutionResult {
  taskId: string;
  status: 'SUCCESS' | 'FAILURE';
  stdout: string;
  stderr: string;
  exitCode: number;
  artifacts: { fileName: string; content: string }[];
  metrics: {
    durationMs: number;
    tokensConsumed?: number;
  };
}

export class ClaudeExecutor {
  async executeTask(session: ClaudeSession, taskPayload: Record<string, any>): Promise<KernelExecutionResult> {
    const startTime = Date.now();
    const prompt = taskPayload.prompt || taskPayload.objective || 'Execute subtask';
    const taskId = taskPayload.taskId || `task-${Date.now()}`;

    try {
      const response = await session.sendPrompt(prompt);
      const durationMs = Date.now() - startTime;

      const artifacts: { fileName: string; content: string }[] = [];
      const codeBlockRegex = /```(?:ts|typescript|js)?\n([\s\S]*?)\n```/g;
      let match;
      let fileCounter = 1;
      while ((match = codeBlockRegex.exec(response)) !== null) {
        artifacts.push({
          fileName: `generated_file_${fileCounter++}.ts`,
          content: match[1],
        });
      }

      return {
        taskId,
        status: 'SUCCESS',
        stdout: response,
        stderr: '',
        exitCode: 0,
        artifacts,
        metrics: {
          durationMs,
          tokensConsumed: Math.floor(prompt.length / 4) + Math.floor(response.length / 4),
        },
      };
    } catch (err: any) {
      return {
        taskId,
        status: 'FAILURE',
        stdout: '',
        stderr: err.message || 'Claude CLI execution failed',
        exitCode: 1,
        artifacts: [],
        metrics: {
          durationMs: Date.now() - startTime,
        },
      };
    }
  }
}
