import { spawnSync } from 'node:child_process';

const providers = [
  { id: 'claude', version: ['--version'], auth: ['auth', 'status'] },
  { id: 'codex', version: ['--version'], auth: ['login', 'status'] },
  { id: 'gemini', version: ['--version'] },
  { id: 'agy', version: ['--version'] },
];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10000 });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]').trim(),
  };
}

console.log('SE-OS live provider smoke test (no generation/API prompt is executed)');
for (const provider of providers) {
  const version = run(provider.id, provider.version);
  if (!version.ok) {
    console.log(`- ${provider.id}: NOT INSTALLED or unavailable`);
    continue;
  }
  console.log(`- ${provider.id}: installed (${version.output.split(/\r?\n/)[0] || 'version unknown'})`);
  if (provider.auth) {
    const auth = run(provider.id, provider.auth);
    console.log(`  auth: ${auth.ok ? 'reported success' : 'not confirmed'}${auth.output ? ` — ${auth.output.split(/\r?\n/)[0].slice(0, 140)}` : ''}`);
  }
}

console.log('Live generation is intentionally opt-in; use the provider CLI directly after reviewing the target workspace.');
