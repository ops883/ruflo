import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'session-test-id'),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  renameSync: vi.fn(),
}));

vi.mock('../src/output.js', () => ({
  output: {
    writeln: vi.fn(),
    printJson: vi.fn(),
    success: (str: string) => str,
    bold: (str: string) => str,
    dim: (str: string) => str,
  },
}));

import { output } from '../src/output.js';
import { autopilotCommand } from '../src/commands/autopilot.js';

describe('autopilot command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs status in ESM mode without require errors', async () => {
    const statusCommand = autopilotCommand.subcommands?.find(command => command.name === 'status');

    const result = await statusCommand?.action?.({
      args: [],
      flags: {},
      cwd: process.cwd(),
      interactive: false,
      config: {},
    });

    expect(result).toEqual({ success: true });
    expect(output.writeln).toHaveBeenCalledWith('Autopilot: ✗ DISABLED');
    expect(output.writeln).toHaveBeenCalledWith('Session: session-...');
  });
});
