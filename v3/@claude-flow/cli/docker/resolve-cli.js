/**
 * Resolve the @claude-flow/cli package path at runtime.
 *
 * npm may install it at different depths depending on hoisting:
 *   /usr/local/lib/node_modules/ruflo/node_modules/@claude-flow/cli
 *   /usr/local/lib/node_modules/@claude-flow/cli
 *
 * This module checks both locations.
 */

import { existsSync } from 'fs';

const CANDIDATES = [
  '/usr/local/lib/node_modules/ruflo/node_modules/@claude-flow/cli',
  '/usr/local/lib/node_modules/@claude-flow/cli',
];

export function findCLIPath() {
  for (const candidate of CANDIDATES) {
    if (existsSync(`${candidate}/dist/src/mcp-client.js`)) {
      console.error(`[ruflo-mcp] Resolved @claude-flow/cli at: ${candidate}`);
      return candidate;
    }
  }
  throw new Error(
    `Cannot find @claude-flow/cli dist. Checked:\n${CANDIDATES.map(c => `  - ${c}`).join('\n')}`
  );
}
