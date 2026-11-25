import type { ResolvedUiLanguage, UiLanguage } from './types';

/**
 * 設定値とエディタ言語から実際の表示言語を解決する
 */
export function resolveUiLanguage(setting: UiLanguage, editorLanguage = 'en'): ResolvedUiLanguage {
  if (setting === 'ja' || setting === 'en') {
    return setting;
  }
  return editorLanguage.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/**
 * 表示言語に応じた UI 文字列辞書
 */
export interface UiMessages {
  progressTitle: string;
  noStagedAndUnstaged: string;
  noStagedOnly: string;
  emptyModelResponse: string;
  actionOpenSettings: string;
  actionViewLogs: string;
  actionOpenCopilotSettings: string;
  cliNotFound: string;
  modelUnavailable: string;
  cliAuthFailed: string;
  cliFailedPrefix: string;
  cliTimeout: (seconds: number) => string;
  apiMissingUrlOrModel: string;
  apiAuthFailed: (status: number) => string;
  apiModelUnavailable: (status: number, detail: string) => string;
  apiRequestFailed: (status: number, detail: string) => string;
  apiInvalidJson: string;
  apiEmptyResponse: string;
  apiTimeout: (seconds: number) => string;
  apiNetworkFailed: (detail: string) => string;
  settingsSaved: string;
  testRunning: string;
  testSucceeded: (preview: string) => string;
  panelTitle: string;
}

const JA_MESSAGES: UiMessages = {
  progressTitle: 'コミットメッセージを生成中...',
  noStagedAndUnstaged: 'ステージングおよび未ステージの変更が見つかりませんでした。',
  noStagedOnly: 'ステージングされた変更がありません。先にファイルをステージングしてください。',
  emptyModelResponse: 'モデルから有効なコミットメッセージが返されませんでした。',
  actionOpenSettings: '設定を開く',
  actionViewLogs: 'ログを見る',
  actionOpenCopilotSettings: 'GitHub Copilot 設定を開く',
  cliNotFound: 'copilot CLI が見つかりません。インストール状態か設定画面の CLI パスを確認してください。',
  modelUnavailable:
    'Copilot CLI で利用可能なモデルが見つかりませんでした。モデル欄を fusion にするか、GitHub の Copilot Features 設定を確認してください。設定画面から OpenAI 互換 API に切り替えることもできます。',
  cliAuthFailed: 'GitHub Copilot CLI の認証に失敗しました。ターミナルで copilot login を実行してください。',
  cliFailedPrefix: 'Copilot CLI の実行に失敗しました',
  cliTimeout: (seconds) => `Copilot CLI の応答が ${seconds} 秒でタイムアウトしました。`,
  apiMissingUrlOrModel: 'API のベース URL とモデル名を設定画面で入力してください。',
  apiAuthFailed: (status) => `API の認証に失敗しました (HTTP ${status})。設定画面で API キーを確認してください。`,
  apiModelUnavailable: (status, detail) =>
    `指定したモデルまたはエンドポイントが利用できません (HTTP ${status}): ${detail}`,
  apiRequestFailed: (status, detail) => `API リクエストに失敗しました (HTTP ${status}): ${detail}`,
  apiInvalidJson: 'API レスポンスの JSON 解析に失敗しました。',
  apiEmptyResponse: 'API から空の応答が返されました。',
  apiTimeout: (seconds) => `API の応答が ${seconds} 秒でタイムアウトしました。`,
  apiNetworkFailed: (detail) => `API 通信に失敗しました: ${detail}`,
  settingsSaved: '設定を保存しました。',
  testRunning: '接続テストを実行しています...',
  testSucceeded: (preview) => `接続に成功しました。応答: ${preview}`,
  panelTitle: 'Copilot CLI Commit 設定'
};

const EN_MESSAGES: UiMessages = {
  progressTitle: 'Generating commit message...',
  noStagedAndUnstaged: 'No staged or unstaged changes were found.',
  noStagedOnly: 'No staged changes found. Please stage files first.',
  emptyModelResponse: 'The model returned an empty commit message.',
  actionOpenSettings: 'Open Settings',
  actionViewLogs: 'View Logs',
  actionOpenCopilotSettings: 'Open GitHub Copilot Settings',
  cliNotFound: 'copilot CLI was not found. Please check your installation or CLI path setting.',
  modelUnavailable:
    'No supported Copilot CLI model was found. Try setting the model to fusion, checking your GitHub Copilot Features settings, or switching to an OpenAI-compatible API.',
  cliAuthFailed: 'GitHub Copilot CLI authentication failed. Please run copilot login in your terminal.',
  cliFailedPrefix: 'Copilot CLI execution failed',
  cliTimeout: (seconds) => `Copilot CLI timed out after ${seconds} seconds.`,
  apiMissingUrlOrModel: 'Please enter both API Base URL and API Model in Settings.',
  apiAuthFailed: (status) => `API authentication failed (HTTP ${status}). Please check your API key in Settings.`,
  apiModelUnavailable: (status, detail) =>
    `The specified model or endpoint is unavailable (HTTP ${status}): ${detail}`,
  apiRequestFailed: (status, detail) => `API request failed (HTTP ${status}): ${detail}`,
  apiInvalidJson: 'Failed to parse API response JSON.',
  apiEmptyResponse: 'The API returned an empty response.',
  apiTimeout: (seconds) => `API request timed out after ${seconds} seconds.`,
  apiNetworkFailed: (detail) => `API communication failed: ${detail}`,
  settingsSaved: 'Settings saved.',
  testRunning: 'Testing connection...',
  testSucceeded: (preview) => `Connection succeeded. Reply: ${preview}`,
  panelTitle: 'Copilot CLI Commit Settings'
};

/**
 * 解決済み言語に対応するメッセージ辞書を返す
 */
export function getMessages(lang: ResolvedUiLanguage): UiMessages {
  return lang === 'ja' ? JA_MESSAGES : EN_MESSAGES;
}
