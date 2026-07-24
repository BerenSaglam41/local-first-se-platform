import { execFile } from 'child_process';

const REFRESH_INTERVAL_MS = 4000;

/**
 * Real `git rev-parse` output, never blocking the caller's thread to get it. TelemetryAggregator
 * previously ran `execSync('git rev-parse ...')` once per busy worker on every 500ms snapshot poll
 * (see ADR-0006) — at real scale (many busy workers, each in its own workspace) that froze the
 * entire Node.js event loop, including the TUI render loop and every in-flight process's stdout
 * handling, repeatedly and indefinitely. This cache answers synchronously from the last known
 * value and refreshes asynchronously in the background, so a stale-by-a-few-seconds branch name is
 * traded for a process that never stalls.
 */
export class GitBranchCache {
  private branches = new Map<string, string>();
  private lastFetchedAt = new Map<string, number>();
  private inFlight = new Set<string>();

  /** Never blocks. Returns the last known branch (or a real, honest placeholder before the first
   * fetch resolves) and kicks off a background refresh if the cached value is stale. */
  getSync(workspacePath?: string): string {
    if (!workspacePath) return 'no-workspace';

    const cached = this.branches.get(workspacePath);
    const lastFetched = this.lastFetchedAt.get(workspacePath) || 0;
    const isStale = Date.now() - lastFetched > REFRESH_INTERVAL_MS;

    if (isStale && !this.inFlight.has(workspacePath)) {
      this.refresh(workspacePath);
    }

    return cached ?? 'detecting...';
  }

  private refresh(workspacePath: string): void {
    this.inFlight.add(workspacePath);
    execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspacePath, timeout: 5000 }, (err, stdout) => {
      this.inFlight.delete(workspacePath);
      this.lastFetchedAt.set(workspacePath, Date.now());
      this.branches.set(workspacePath, err ? 'no-repo' : stdout.trim() || 'no-repo');
    });
  }
}
