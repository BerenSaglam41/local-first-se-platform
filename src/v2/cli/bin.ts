#!/usr/bin/env node
import { SeOsCli } from './se_os_cli.js';
import { ProcessGuardian } from '../infrastructure/resilience/process_guardian.js';

async function main() {
  const cli = new SeOsCli();

  // Installed before boot() so the process is protected for its entire lifetime, including
  // during boot itself — see ADR-0008. Kernel.shutdown() (reached via cli.shutdown()) already
  // no-ops safely if boot() never completed.
  const guardian = new ProcessGuardian({
    onShutdownSignal: async () => {
      await cli.shutdown();
    },
    onFatalError: async (error, origin) => {
      console.error(`❌ Fatal ${origin}:`, error);
      await cli.shutdown();
    },
  });
  guardian.install();

  try {
    await cli.boot();
    await cli.tuiLaunch();
  } catch (err: any) {
    console.error(`❌ Fatal Error launching SE-OS TUI: ${err?.message || err}`);
    process.exit(1);
  }
}

main();
