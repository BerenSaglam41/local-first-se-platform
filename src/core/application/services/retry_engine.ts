import { EngineeringTask } from '../../domain/models/execution';

export class RetryEngine {
  buildRetryPrompt(
    task: EngineeringTask,
    previousResponse: string,
    verificationLogs: string,
    attempt: number
  ): string {
    const allowedFiles = task.plan?.subTasks.map(st => st.targetFile) || [task.entryFile];
    const forbiddenFiles = [
      'package.json', 'package-lock.json', 'tsconfig.json',
      'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
      'Dockerfile', 'docker-compose.yml', '.gitignore'
    ];

    const errorSnippet = verificationLogs ? verificationLogs.split('\n').slice(0, 10).join('\n') : '(Verification steps returned error status)';

    return `====================================================
EXECUTION SPECIFICATION RETRY (ATTEMPT ${attempt})
====================================================

1. ORIGINAL OBJECTIVE:
"${task.description}"

2. VERIFICATION FAILURE SUMMARY:
${errorSnippet}

3. ALLOWED TARGET FILES:
- ${allowedFiles.join('\n- ')}

4. FORBIDDEN PROTECTED FILES:
- ${forbiddenFiles.join('\n- ')}

5. MANDATORY OUTPUT FORMAT CONTRACT:
Output ONLY pure source code blocks matching the allowed target files.
Every code block MUST start with the file header comment:
// FILE: relative/path/to/file.ext

DO NOT output conversational text, markdown explanations, shell commands, or JSON tool calls.`;
  }
}
