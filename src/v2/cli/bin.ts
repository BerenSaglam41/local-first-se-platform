#!/usr/bin/env node
import { SeOsCli } from './se_os_cli';

async function main() {
  try {
    const cli = new SeOsCli();
    await cli.boot();
    await cli.tuiLaunch();
  } catch (err: any) {
    console.error(`❌ Fatal Error launching SE-OS TUI: ${err?.message || err}`);
    process.exit(1);
  }
}

main();
