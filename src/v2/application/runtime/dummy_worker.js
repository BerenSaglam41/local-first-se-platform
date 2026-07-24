/**
 * Harmless dummy worker executable for testing Local Process Runtime & PTY Engine.
 */
console.log('Dummy Worker Online PID:', process.pid);

process.stdin.on('data', (chunk) => {
  const input = chunk.toString('utf8').trim();
  console.log(`[Dummy Worker ECHO] ${input}`);
  if (input === 'exit') {
    process.exit(0);
  }
});

setInterval(() => {}, 1000);
