import type * as vscode from 'vscode';

/**
 * UI の表示言語設定
 */
export type UiLanguage = 'auto' | 'ja' | 'en';

/**
 * 解決済みの UI 表示言語
 */
export type ResolvedUiLanguage = 'ja' | 'en';

/**
 * 接続先プロバイダーの種類
 */
export type ProviderType = 'copilot-cli' | 'openai-compatible';

/**
 * 出力言語の設定値
 */
export type CommitLanguage = 'ja' | 'en' | 'auto';

/**
 * コミットメッセージの書式スタイル
 */
export type CommitStyle = 'conventional' | 'plain';

/**
 * 推論の深さの設定値
 */
export type ReasoningEffort = '' | 'none' | 'minimal' | 'low' | 'medium' | 'high';

/**
 * 拡張機能の設定オブジェクト
 */
export interface ExtensionConfig {
  uiLanguage: UiLanguage;
  provider: ProviderType;
  cliPath: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  apiBaseUrl: string;
  apiModel: string;
  language: CommitLanguage;
  style: CommitStyle;
  includeBody: boolean;
  customInstructions: string;
  instructionFiles: string[];
  recentCommitsCount: number;
  maxDiffChars: number;
  excludePatterns: string[];
  fallbackToUnstaged: boolean;
  timeoutSeconds: number;
}

/**
 * 差分の取得元
 */
export type DiffSource = 'staged' | 'unstaged';

/**
 * プロンプト生成に渡す Git コンテキスト情報
 */
export interface GitContext {
  branchName: string;
  recentCommits: string[];
  instructionsText: string;
  stat: string;
  diff: string;
  diffTruncated: boolean;
  source: DiffSource;
}

/**
 * キャンセル通知用の最小インターフェース
 */
export interface CancellationLike {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

/**
 * VS Code 組み込み Git 拡張の最小 API 型定義
 */
export interface GitExtensionExports {
  getAPI(version: 1): GitAPI;
}

export interface GitAPI {
  readonly repositories: GitRepository[];
}

export interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: {
    value: string;
  };
}
