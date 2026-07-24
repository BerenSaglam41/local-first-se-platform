export class CliFormatter {
  static reset = '\x1b[0m';
  static boldStr = '\x1b[1m';
  static dimStr = '\x1b[2m';
  
  static red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  static green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  static yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  static blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
  static magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;
  static cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  static gray = (s: string) => `\x1b[90m${s}\x1b[0m`;
  static dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  static bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

  static brightRed = (s: string) => `\x1b[91m${s}\x1b[0m`;
  static brightGreen = (s: string) => `\x1b[92m${s}\x1b[0m`;
  static brightYellow = (s: string) => `\x1b[93m${s}\x1b[0m`;
  static brightCyan = (s: string) => `\x1b[96m${s}\x1b[0m`;

  static iconSuccess = '\x1b[32m✔\x1b[0m';
  static iconFailure = '\x1b[31m✖\x1b[0m';
  static iconActive = '\x1b[36m▶\x1b[0m';
  static iconWait = '\x1b[33m⏳\x1b[0m';
  static iconWorkspace = '\x1b[34m📂\x1b[0m';
  static iconWarn = '\x1b[33m⚠️\x1b[0m';

  static stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }

  static divider(char = '─', length = 68): string {
    return CliFormatter.gray(char.repeat(length));
  }

  static headerBox(title: string, length = 68): string {
    const padded = ` ${title} `;
    const sideLen = Math.max(0, Math.floor((length - padded.length) / 2));
    const border = '─'.repeat(sideLen);
    return CliFormatter.brightCyan(`┌${border}${padded}${border}┐`);
  }

  static padVisible(str: string, targetLength: number): string {
    const visibleLength = CliFormatter.stripAnsi(str).length;
    const paddingNeeded = Math.max(0, targetLength - visibleLength);
    return str + ' '.repeat(paddingNeeded);
  }

  static renderSummaryCard(data: {
    taskId: string;
    taskPrompt: string;
    status: string;
    durationMs: number;
    whatHappened: { stage: string; status: string; summary: string }[];
    whatDidNotHappen: string[];
    rootCause?: string;
    validationErrors?: string[];
    verificationLogs?: string;
  }): string {
    const width = 74;
    const innerWidth = width - 4; // space for '│ ' and ' │'
    const isSuccess = data.status === 'SUCCESS';
    const statusText = isSuccess ? CliFormatter.bold(CliFormatter.brightGreen('PASSED')) : CliFormatter.bold(CliFormatter.brightRed('FAILED'));
    const duration = (data.durationMs / 1000).toFixed(2) + ' s (' + data.durationMs + ' ms)';

    let out = '\n';
    out += CliFormatter.cyan('┌' + '─'.repeat(width - 2) + '┐') + '\n';
    
    // Header Title
    const titleText = CliFormatter.bold(CliFormatter.brightCyan('DETAILED EXECUTION REPORT'));
    out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(`               ${titleText}`, innerWidth) + CliFormatter.cyan(' │') + '\n';
    out += CliFormatter.cyan('├' + '─'.repeat(width - 2) + '┤') + '\n';

    // Metadata block
    out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(`Task ID:     ${CliFormatter.bold(data.taskId)}`, innerWidth) + CliFormatter.cyan(' │') + '\n';
    out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(`Summary:     "${data.taskPrompt}"`, innerWidth) + CliFormatter.cyan(' │') + '\n';
    out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(`Status:      ${statusText}`, innerWidth) + CliFormatter.cyan(' │') + '\n';
    out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(`Duration:    ${CliFormatter.brightYellow(duration)}`, innerWidth) + CliFormatter.cyan(' │') + '\n';
    out += CliFormatter.cyan('├' + '─'.repeat(width - 2) + '┤') + '\n';

    // Section 1: WHAT HAPPENED
    out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(CliFormatter.bold(CliFormatter.brightGreen('WHAT HAPPENED')), innerWidth) + CliFormatter.cyan(' │') + '\n';
    data.whatHappened.forEach((item) => {
      const icon = item.status === 'SUCCESS' ? CliFormatter.iconSuccess : CliFormatter.iconFailure;
      const line = `  ${icon} ${CliFormatter.bold(item.stage)}: ${item.summary}`;
      out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(line, innerWidth) + CliFormatter.cyan(' │') + '\n';
    });

    // Section 2: WHAT DID NOT HAPPEN
    out += CliFormatter.cyan('├' + '─'.repeat(width - 2) + '┤') + '\n';
    out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(CliFormatter.bold(CliFormatter.brightYellow('WHAT DID NOT HAPPEN')), innerWidth) + CliFormatter.cyan(' │') + '\n';
    if (data.whatDidNotHappen.length > 0) {
      data.whatDidNotHappen.forEach((item) => {
        const line = `  ${CliFormatter.gray('-')} ${item}`;
        out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(line, innerWidth) + CliFormatter.cyan(' │') + '\n';
      });
    } else {
      const line = `  ${CliFormatter.gray('-')} None (Full execution pipeline executed without skips)`;
      out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(line, innerWidth) + CliFormatter.cyan(' │') + '\n';
    }

    // Section 3: ROOT CAUSE DIAGNOSTICS
    out += CliFormatter.cyan('├' + '─'.repeat(width - 2) + '┤') + '\n';
    out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(CliFormatter.bold(CliFormatter.brightRed('ROOT CAUSE DIAGNOSTICS')), innerWidth) + CliFormatter.cyan(' │') + '\n';
    if (isSuccess) {
      const line = `  ${CliFormatter.iconSuccess} Pipeline parsed context, generated response, applied patches & verified build/test cleanly.`;
      out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(line, innerWidth) + CliFormatter.cyan(' │') + '\n';
    } else {
      const causeText = data.rootCause || 'Execution did not produce verified workspace updates.';
      const causeLine = `  ${CliFormatter.brightRed('Root Cause:')} ${causeText}`;
      out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(causeLine, innerWidth) + CliFormatter.cyan(' │') + '\n';

      if (data.validationErrors && data.validationErrors.length > 0) {
        data.validationErrors.forEach((err) => {
          const errLine = `    • ${CliFormatter.yellow(err)}`;
          out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(errLine, innerWidth) + CliFormatter.cyan(' │') + '\n';
        });
      }
      if (data.verificationLogs) {
        const logs = data.verificationLogs.split('\n').slice(0, 4);
        logs.forEach((log) => {
          if (log.trim()) {
            const logLine = `    ${CliFormatter.gray('│')} ${log.trim()}`;
            out += CliFormatter.cyan('│ ') + CliFormatter.padVisible(logLine, innerWidth) + CliFormatter.cyan(' │') + '\n';
          }
        });
      }
    }

    out += CliFormatter.cyan('└' + '─'.repeat(width - 2) + '┘') + '\n';
    return out;
  }
}
