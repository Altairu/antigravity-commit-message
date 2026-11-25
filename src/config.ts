import * as vscode from 'vscode';
import type { CommitLanguage, CommitStyle, ExtensionConfig, ProviderType, ReasoningEffort, UiLanguage } from './types';

const CONFIG_SECTION = 'copilotCliCommit';
const API_KEY_SECRET_NAME = 'copilotCliCommit.apiKey';

/**
 * ワークスペース設定から拡張機能の設定値を読み込む
 */
export function getExtensionConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    uiLanguage: cfg.get<UiLanguage>('uiLanguage', 'auto'),
    provider: cfg.get<ProviderType>('provider', 'copilot-cli'),
    cliPath: cfg.get<string>('cliPath', 'copilot').trim() || 'copilot',
    model: cfg.get<string>('model', 'fusion').trim() || 'fusion',
    reasoningEffort: cfg.get<ReasoningEffort>('reasoningEffort', ''),
    apiBaseUrl: cfg.get<string>('apiBaseUrl', 'https://generativelanguage.googleapis.com/v1beta/openai').trim(),
    apiModel: cfg.get<string>('apiModel', 'gemini-3.5-flash-lite').trim(),
    language: cfg.get<CommitLanguage>('language', 'ja'),
    style: cfg.get<CommitStyle>('style', 'conventional'),
    includeBody: cfg.get<boolean>('includeBody', false),
    customInstructions: cfg.get<string>('customInstructions', ''),
    instructionFiles: cfg.get<string[]>('instructionFiles', ['.github/copilot-instructions.md']),
    recentCommitsCount: Math.max(0, cfg.get<number>('recentCommitsCount', 10)),
    maxDiffChars: Math.max(1000, cfg.get<number>('maxDiffChars', 24000)),
    excludePatterns: cfg.get<string[]>('excludePatterns', [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Cargo.lock',
      'poetry.lock',
      '*.min.js',
      '*.min.css',
      '*.map'
    ]),
    fallbackToUnstaged: cfg.get<boolean>('fallbackToUnstaged', true),
    timeoutSeconds: Math.max(5, cfg.get<number>('timeoutSeconds', 60))
  };
}

/**
 * 拡張機能の設定値をグローバル設定へ一括保存する
 */
export async function saveExtensionConfig(partial: Partial<ExtensionConfig>): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const entries = Object.entries(partial) as Array<[keyof ExtensionConfig, ExtensionConfig[keyof ExtensionConfig]]>;

  for (const [key, value] of entries) {
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  }
}

/**
 * SecretStorage から OpenAI 互換 API キーを取得する
 */
export async function getApiKey(secrets: vscode.SecretStorage): Promise<string> {
  return (await secrets.get(API_KEY_SECRET_NAME)) ?? '';
}

/**
 * SecretStorage に OpenAI 互換 API キーを保存または削除する
 */
export async function setApiKey(secrets: vscode.SecretStorage, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) {
    await secrets.delete(API_KEY_SECRET_NAME);
    return;
  }
  await secrets.store(API_KEY_SECRET_NAME, trimmed);
}
