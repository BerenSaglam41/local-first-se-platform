import { CliFormatter } from '../src/infrastructure/logging/cli_formatter';

describe('CliFormatter Utility', () => {
  it('should format text with ANSI escape codes', () => {
    expect(CliFormatter.red('error')).toContain('\x1b[31merror\x1b[0m');
    expect(CliFormatter.green('success')).toContain('\x1b[32msuccess\x1b[0m');
    expect(CliFormatter.bold('header')).toContain('\x1b[1mheader\x1b[0m');
    expect(CliFormatter.cyan('info')).toContain('\x1b[36minfo\x1b[0m');
  });

  it('should strip ANSI escape codes correctly', () => {
    const colored = CliFormatter.brightGreen('Passed');
    expect(CliFormatter.stripAnsi(colored)).toBe('Passed');
  });

  it('should pad visible text accounting for ANSI escape codes', () => {
    const colored = CliFormatter.brightCyan('TITLE');
    const padded = CliFormatter.padVisible(colored, 10);
    expect(CliFormatter.stripAnsi(padded)).toBe('TITLE     ');
    expect(CliFormatter.stripAnsi(padded).length).toBe(10);
  });

  it('should render a structured ASCII execution report summary card', () => {
    const summary = CliFormatter.renderSummaryCard({
      taskId: 'task-12345',
      taskPrompt: 'Implement test feature',
      status: 'SUCCESS',
      durationMs: 1250,
      whatHappened: [
        { stage: 'Workspace Scan', status: 'SUCCESS', summary: 'Found 10 files' },
        { stage: 'Verification Runner', status: 'SUCCESS', summary: 'Build PASS, Tests PASS' }
      ],
      whatDidNotHappen: [
        'Autonomous Retry Engine: Not triggered'
      ]
    });

    expect(summary).toContain('DETAILED EXECUTION REPORT');
    expect(summary).toContain('task-12345');
    expect(summary).toContain('PASSED');
    expect(summary).toContain('WHAT HAPPENED');
    expect(summary).toContain('WHAT DID NOT HAPPEN');
    expect(summary).toContain('ROOT CAUSE DIAGNOSTICS');
  });
});
