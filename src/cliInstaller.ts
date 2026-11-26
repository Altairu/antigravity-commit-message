import type * as vscode from 'vscode';
import { getMessages } from './i18n';
import type { ResolvedUiLanguage } from './types';

export interface CliInstallOption {
  id: string;
  label: string;
  description: string;
  detail: string;
  command: string;
}

/**
 * 実行中の OS に応じた GitHub Copilot CLI インストール方法一覧を返す
 */
export function getCliInstallOptions(
  platform: NodeJS.Platform = process.platform,
  lang: ResolvedUiLanguage = 'ja'
): CliInstallOption[] {
  const isJa = lang === 'ja';

  const npmOption: CliInstallOption = {
    id: 'npm',
    label: isJa ? 'npm でインストール (Node.js 22+)' : 'Install via npm (Node.js 22+)',
    description: 'npm install -g @github/copilot',
    detail: isJa
      ? 'Node.js 22 以降が入っている環境で共通して使えます。'
      : 'Works cross-platform when Node.js 22 or later is installed.',
    command: 'npm install -g @github/copilot'
  };

  if (platform === 'win32') {
    return [
      {
        id: 'winget',
        label: isJa ? 'WinGet でインストール (推奨)' : 'Install via WinGet (Recommended)',
        description: 'winget install GitHub.Copilot',
        detail: isJa
          ? 'Windows 標準のパッケージマネージャー WinGet を使用します。'
          : 'Uses the built-in Windows Package Manager (WinGet).',
        command: 'winget install GitHub.Copilot'
      },
      npmOption
    ];
  }

  if (platform === 'darwin') {
    return [
      {
        id: 'brew',
        label: isJa ? 'Homebrew でインストール (推奨)' : 'Install via Homebrew (Recommended)',
        description: 'brew install --cask copilot-cli',
        detail: isJa
          ? 'macOS の Homebrew を使用してインストールします。'
          : 'Installs GitHub Copilot CLI using Homebrew on macOS.',
        command: 'brew install --cask copilot-cli'
      },
      npmOption
    ];
  }

  return [
    {
      ...npmOption,
      label: isJa ? 'npm でインストール (推奨 / Node.js 22+)' : 'Install via npm (Recommended / Node.js 22+)'
    },
    {
      id: 'curl',
      label: isJa ? '公式インストールスクリプトを実行' : 'Run Official Install Script',
      description: 'curl -fsSL https://gh.io/copilot-install | bash',
      detail: isJa
        ? 'Linux / macOS 向けの公式スクリプトでインストールします。'
        : 'Installs using the official shell script.',
      command: 'curl -fsSL https://gh.io/copilot-install | bash'
    },
    {
      id: 'brew',
      label: isJa ? 'Homebrew でインストール' : 'Install via Homebrew',
      description: 'brew install --cask copilot-cli',
      detail: isJa
        ? 'Homebrew (Linuxbrew) を使用してインストールします。'
        : 'Installs using Homebrew.',
      command: 'brew install --cask copilot-cli'
    }
  ];
}

/**
 * OS に応じたインストール方法を選択させ、新しいターミナルを開いてコマンドを実行する
 */
export async function promptAndRunCliInstall(
  lang: ResolvedUiLanguage,
  outputChannel?: vscode.OutputChannel
): Promise<void> {
  // テスト環境で vscode モジュールを読み込まないよう、実行時に取得する
  const vscodeApi = require('vscode') as typeof import('vscode');
  const m = getMessages(lang);
  const options = getCliInstallOptions(process.platform, lang);

  const picked = await vscodeApi.window.showQuickPick(options, {
    placeHolder: m.installCliPickPlaceholder,
    ignoreFocusOut: true
  });

  if (!picked) {
    return;
  }

  const terminal = vscodeApi.window.createTerminal({
    name: 'Install GitHub Copilot CLI'
  });
  terminal.show(false);
  terminal.sendText(picked.command, true);

  outputChannel?.appendLine(`[INFO] Copilot CLI インストールコマンドをターミナルへ送信しました: ${picked.command}`);
  void vscodeApi.window.showInformationMessage(m.installCliStarted(picked.command));
}
