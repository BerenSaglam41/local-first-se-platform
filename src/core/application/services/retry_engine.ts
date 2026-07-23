import { EngineeringTask } from '../../domain/models/execution';

export class RetryEngine {
  buildRetryPrompt(
    task: EngineeringTask,
    previousResponse: string,
    verificationLogs: string,
    attempt: number
  ): string {
    return `You are in autonomous self-repair mode. Your previous generated solution failed workspace verification.

Original Task: ${task.description}

Attempt Number: ${attempt}

Previous Response:
${previousResponse}

Verification Failure Logs (Build/Test errors):
${verificationLogs}

Please review the compiler errors and test failures, identify the issue, and output the correct refactored code matching the workspace target files. Make sure to return valid code blocks.`;
  }
}
