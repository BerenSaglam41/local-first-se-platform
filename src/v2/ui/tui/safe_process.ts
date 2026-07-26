import { spawn, ChildProcess } from 'child_process';

/** Starts a local UI action without passing user-controlled paths through a shell. */
export function spawnDetached(command: string, args: string[], cwd?: string): ChildProcess {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    shell: false,
  });
  child.unref();
  return child;
}

export function openPath(application: string, targetPath: string): ChildProcess {
  return spawnDetached(application, [targetPath]);
}
