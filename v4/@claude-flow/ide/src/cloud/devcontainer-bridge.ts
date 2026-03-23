/**
 * @claude-flow/ide - Cloud IDE Dev Container Bridge
 *
 * Integrates Ruflo into Gitpod, GitHub Codespaces, and StackBlitz by
 * detecting the cloud environment, generating a devcontainer feature config,
 * and patching .devcontainer/devcontainer.json to include Ruflo setup.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CloudEnvironment = 'gitpod' | 'codespaces' | 'stackblitz' | 'generic';

export interface DevcontainerFeature {
  id: string;
  version: string;
  options?: Record<string, unknown>;
}

export interface DevcontainerConfig {
  name?: string;
  image?: string;
  features?: Record<string, unknown>;
  postCreateCommand?: string | string[];
  remoteEnv?: Record<string, string>;
  customizations?: {
    vscode?: {
      extensions?: string[];
      settings?: Record<string, unknown>;
    };
  };
  [key: string]: unknown;
}

export interface DevcontainerBridgeOptions {
  /** Ruflo version to install in the devcontainer */
  rufloVersion?: string;
  /** Whether to run `ruflo init` in postCreateCommand */
  runInit?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class DevcontainerBridge extends EventEmitter {
  private readonly options: Required<DevcontainerBridgeOptions>;

  constructor(options: DevcontainerBridgeOptions = {}) {
    super();
    this.options = {
      rufloVersion: options.rufloVersion ?? 'v3alpha',
      runInit: options.runInit ?? true,
    };
  }

  /**
   * Probes process.env for well-known cloud IDE environment variables.
   * Returns null when running locally.
   */
  detectEnvironment(): CloudEnvironment | null {
    if (process.env['GITPOD_WORKSPACE_ID']) {
      return 'gitpod';
    }
    if (process.env['CODESPACE_NAME']) {
      return 'codespaces';
    }
    if (process.env['STACKBLITZ_ENV']) {
      return 'stackblitz';
    }
    return null;
  }

  /**
   * Returns the devcontainer feature object for Ruflo. This can be added to
   * the `features` key of devcontainer.json.
   */
  generateDevcontainerFeature(): DevcontainerFeature {
    return {
      id: 'ghcr.io/ruvnet/claude-flow/ruflo',
      version: this.options.rufloVersion,
      options: {
        initOnCreate: this.options.runInit,
      },
    };
  }

  /**
   * Writes / patches .devcontainer/devcontainer.json to include the Ruflo
   * feature and adds the initialisation command to postCreateCommand.
   * Also triggers `npx ruflo init` when running in a cloud environment.
   */
  async init(workspaceRoot: string): Promise<void> {
    const dir = join(workspaceRoot, '.devcontainer');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const configPath = join(dir, 'devcontainer.json');
    const config = this.loadOrCreateConfig(configPath);

    this.applyRufloFeature(config);
    this.applyPostCreateCommand(config);
    this.applyRemoteEnv(config);
    this.applyVSCodeExtensions(config);

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    this.emit('configWritten', configPath);

    // Run ruflo init when in a recognised cloud environment
    const env = this.detectEnvironment();
    if (env && this.options.runInit) {
      await this.runRufloInit(workspaceRoot);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private loadOrCreateConfig(configPath: string): DevcontainerConfig {
    if (existsSync(configPath)) {
      try {
        return JSON.parse(readFileSync(configPath, 'utf8')) as DevcontainerConfig;
      } catch {
        this.emit('warning', `Could not parse ${configPath} — creating new config`);
      }
    }

    return {
      name: 'Ruflo Dev Environment',
      image: 'mcr.microsoft.com/devcontainers/universal:2',
    };
  }

  private applyRufloFeature(config: DevcontainerConfig): void {
    if (!config.features) {
      config.features = {};
    }
    const feature = this.generateDevcontainerFeature();
    config.features[feature.id] = feature.options ?? {};
  }

  private applyPostCreateCommand(config: DevcontainerConfig): void {
    const rufloInit = `npx ruflo@${this.options.rufloVersion} init --wizard`;

    if (!config.postCreateCommand) {
      config.postCreateCommand = rufloInit;
      return;
    }

    if (typeof config.postCreateCommand === 'string') {
      if (!config.postCreateCommand.includes('ruflo')) {
        config.postCreateCommand = `${config.postCreateCommand} && ${rufloInit}`;
      }
    } else if (Array.isArray(config.postCreateCommand)) {
      const hasRuflo = config.postCreateCommand.some((cmd) => cmd.includes('ruflo'));
      if (!hasRuflo) {
        config.postCreateCommand.push(rufloInit);
      }
    }
  }

  private applyRemoteEnv(config: DevcontainerConfig): void {
    config.remoteEnv = {
      CLAUDE_FLOW_MCP_TRANSPORT: 'stdio',
      CLAUDE_FLOW_LOG_LEVEL: 'info',
      ...config.remoteEnv,
    };
  }

  private applyVSCodeExtensions(config: DevcontainerConfig): void {
    if (!config.customizations) {
      config.customizations = {};
    }
    if (!config.customizations.vscode) {
      config.customizations.vscode = {};
    }
    if (!config.customizations.vscode.extensions) {
      config.customizations.vscode.extensions = [];
    }

    const rufloExtension = 'ruflo.ruflo-ide';
    if (!config.customizations.vscode.extensions.includes(rufloExtension)) {
      config.customizations.vscode.extensions.push(rufloExtension);
    }
  }

  private runRufloInit(workspaceRoot: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        execSync(`npx ruflo@${this.options.rufloVersion} init`, {
          cwd: workspaceRoot,
          stdio: 'pipe',
          timeout: 60_000,
        });
        this.emit('rufloInitCompleted', workspaceRoot);
      } catch (err) {
        this.emit('rufloInitFailed', err instanceof Error ? err : new Error(String(err)));
      }
      resolve();
    });
  }
}
