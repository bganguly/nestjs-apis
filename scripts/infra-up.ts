import { spawnSync } from 'node:child_process';

const seedArgs = process.argv.slice(2);

runCommand('npm', ['run', 'create:table']);

if (seedArgs.length > 0) {
  runCommand('npm', ['run', 'seed:synthetic', '--', ...seedArgs]);
} else {
  runCommand('npm', ['run', 'seed:synthetic', '--', '--count=1000', '--batch=25']);
}

function runCommand(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}
