import { Command } from 'commander';

import { zshCompletionScript } from './zshCompletion';

export function shellInitCommand() {
  const program = new Command('shell-init')
    .description('generate shell completion script')
    .argument('<shell>', 'shell type (zsh, bash)')
    .action(execute);
  return program;
}

function execute(shell: string): void {
  switch (shell.toLowerCase()) {
    case 'zsh':
      console.log(zshCompletionScript);
      break;
    case 'bash':
      console.error('Bash completion is not yet supported. Contributions welcome!');
      process.exitCode = 1;
      break;
    default:
      console.error(`Unknown shell: ${shell}. Supported shells: zsh`);
      process.exitCode = 1;
      break;
  }
}
