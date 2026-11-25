import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { getApiKey, getExtensionConfig, saveExtensionConfig, setApiKey } from './config';
import { runCopilotCli } from './copilotCli';
import { getMessages, resolveUiLanguage } from './i18n';
import { runOpenAiCompatible } from './openaiClient';
import type { CommitLanguage, CommitStyle, ExtensionConfig, ProviderType, ReasoningEffort, UiLanguage } from './types';

const COPILOT_FEATURES_URL = 'https://github.com/settings/copilot/features';

interface WebviewFormPayload {
  config: ExtensionConfig;
  apiKeyInput?: string;
  clearApiKey?: boolean;
}

/**
 * 専用の設定 GUI を提供する Webview パネル管理クラス
 */
export class SettingsPanel {
  private static currentPanel: SettingsPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ) {
    this.panel = panel;
    this.context = context;
    this.outputChannel = outputChannel;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message), null, this.disposables);
    this.panel.webview.html = this.buildHtml();
  }

  /**
   * 設定パネルを表示または前面に出す
   */
  public static createOrShow(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): void {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    const config = getExtensionConfig();
    const uiLang = resolveUiLanguage(config.uiLanguage, vscode.env.language);
    const m = getMessages(uiLang);

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.panel.title = m.panelTitle;
      SettingsPanel.currentPanel.panel.reveal(column);
      void SettingsPanel.currentPanel.sendCurrentState();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'copilotCliCommitSettings',
      m.panelTitle,
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, context, outputChannel);
  }

  /**
   * 現在の設定と API キー保存状態・解決済み UI 言語を Webview へ送信する
   */
  private async sendCurrentState(): Promise<void> {
    const config = getExtensionConfig();
    const apiKey = await getApiKey(this.context.secrets);
    const resolvedUiLang = resolveUiLanguage(config.uiLanguage, vscode.env.language);
    this.panel.title = getMessages(resolvedUiLang).panelTitle;

    await this.panel.webview.postMessage({
      type: 'state',
      config,
      hasApiKey: apiKey.length > 0,
      editorLang: vscode.env.language
    });
  }

  /**
   * Webview からのメッセージを受信して処理する
   */
  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { type?: string; payload?: WebviewFormPayload };

    switch (msg.type) {
      case 'ready': {
        await this.sendCurrentState();
        break;
      }
      case 'save': {
        if (!msg.payload) {
          return;
        }
        const saved = await this.savePayload(msg.payload);
        const uiLang = resolveUiLanguage(saved.uiLanguage, vscode.env.language);
        await this.sendCurrentState();
        await this.panel.webview.postMessage({
          type: 'status',
          ok: true,
          message: getMessages(uiLang).settingsSaved
        });
        break;
      }
      case 'testConnection': {
        if (!msg.payload) {
          return;
        }
        await this.testConnection(msg.payload);
        break;
      }
      case 'openCopilotFeatures': {
        await vscode.env.openExternal(vscode.Uri.parse(COPILOT_FEATURES_URL));
        break;
      }
      case 'openRawSettings': {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'copilotCliCommit');
        break;
      }
    }
  }

  /**
   * フォーム入力を検証・整形して設定と SecretStorage へ保存する
   */
  private async savePayload(payload: WebviewFormPayload): Promise<ExtensionConfig> {
    const normalized = this.normalizeConfig(payload.config);
    await saveExtensionConfig(normalized);

    if (payload.clearApiKey) {
      await setApiKey(this.context.secrets, '');
    } else if (typeof payload.apiKeyInput === 'string' && payload.apiKeyInput.trim().length > 0) {
      await setApiKey(this.context.secrets, payload.apiKeyInput);
    }

    return normalized;
  }

  /**
   * 現在のフォーム値で軽量プロンプトの接続テストを実行する
   */
  private async testConnection(payload: WebviewFormPayload): Promise<void> {
    const config = this.normalizeConfig(payload.config);
    const uiLang = resolveUiLanguage(config.uiLanguage, vscode.env.language);
    const m = getMessages(uiLang);

    const savedApiKey = await getApiKey(this.context.secrets);
    const effectiveApiKey =
      payload.clearApiKey
        ? ''
        : typeof payload.apiKeyInput === 'string' && payload.apiKeyInput.trim().length > 0
          ? payload.apiKeyInput.trim()
          : savedApiKey;

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    try {
      const reply =
        config.provider === 'openai-compatible'
          ? await runOpenAiCompatible('Reply with OK', config, effectiveApiKey, undefined, uiLang)
          : await runCopilotCli('Reply with OK', cwd, config, undefined, uiLang);

      const preview = reply.trim().slice(0, 120) || 'OK';
      this.outputChannel.appendLine(`[INFO] 接続テスト成功 (${config.provider}): ${preview}`);
      await this.panel.webview.postMessage({
        type: 'testResult',
        ok: true,
        message: m.testSucceeded(preview)
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[ERROR] 接続テスト失敗 (${config.provider}): ${detail}`);
      await this.panel.webview.postMessage({
        type: 'testResult',
        ok: false,
        message: detail
      });
    }
  }

  /**
   * フォームからの入力値を安全な型と範囲に正規化する
   */
  private normalizeConfig(raw: ExtensionConfig): ExtensionConfig {
    const uiLanguage: UiLanguage = raw.uiLanguage === 'ja' || raw.uiLanguage === 'en' ? raw.uiLanguage : 'auto';
    const provider: ProviderType = raw.provider === 'openai-compatible' ? 'openai-compatible' : 'copilot-cli';
    const language: CommitLanguage = raw.language === 'en' || raw.language === 'auto' ? raw.language : 'ja';
    const style: CommitStyle = raw.style === 'plain' ? 'plain' : 'conventional';
    const allowedEffort: ReasoningEffort[] = ['', 'none', 'minimal', 'low', 'medium', 'high'];
    const reasoningEffort = allowedEffort.includes(raw.reasoningEffort) ? raw.reasoningEffort : '';

    return {
      uiLanguage,
      provider,
      cliPath: String(raw.cliPath || 'copilot').trim() || 'copilot',
      model: String(raw.model || 'fusion').trim() || 'fusion',
      reasoningEffort,
      apiBaseUrl: String(raw.apiBaseUrl || '').trim(),
      apiModel: String(raw.apiModel || '').trim(),
      language,
      style,
      includeBody: Boolean(raw.includeBody),
      customInstructions: String(raw.customInstructions || ''),
      instructionFiles: Array.isArray(raw.instructionFiles)
        ? raw.instructionFiles.map((s) => String(s).trim()).filter(Boolean)
        : ['.github/copilot-instructions.md'],
      recentCommitsCount: Math.max(0, Math.min(50, Number(raw.recentCommitsCount) || 0)),
      maxDiffChars: Math.max(1000, Number(raw.maxDiffChars) || 24000),
      excludePatterns: Array.isArray(raw.excludePatterns)
        ? raw.excludePatterns.map((s) => String(s).trim()).filter(Boolean)
        : [],
      fallbackToUnstaged: Boolean(raw.fallbackToUnstaged),
      timeoutSeconds: Math.max(5, Number(raw.timeoutSeconds) || 60)
    };
  }

  /**
   * Webview の HTML とスクリプトを生成する
   */
  private buildHtml(): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const csp = [
      "default-src 'none'",
      `style-src 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Copilot CLI Commit Message Settings</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      margin: 0;
      padding: 20px 24px 48px;
      line-height: 1.5;
    }
    .container {
      max-width: 820px;
      margin: 0 auto;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 1.4em;
      margin: 0 0 6px;
      font-weight: 600;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin: 0;
    }
    .lang-box {
      min-width: 190px;
    }
    .section {
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
      background-color: var(--vscode-sideBar-background, transparent);
    }
    .section h2 {
      font-size: 1.1em;
      margin: 0 0 12px;
      font-weight: 600;
    }
    .preset-row, .quick-row, .actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .field {
      margin-bottom: 12px;
    }
    .field:last-child {
      margin-bottom: 0;
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .hint {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
      margin-top: 3px;
    }
    input[type="text"],
    input[type="password"],
    input[type="number"],
    select,
    textarea {
      width: 100%;
      box-sizing: border-box;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.35));
      border-radius: 4px;
      padding: 6px 8px;
      font-family: inherit;
      font-size: inherit;
    }
    textarea {
      min-height: 76px;
      resize: vertical;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .checkbox-row input {
      width: auto;
    }
    .banner {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 4px;
      display: none;
      white-space: pre-wrap;
    }
    .banner.show {
      display: block;
    }
    .banner.ok {
      border: 1px solid var(--vscode-testing-iconPassed, #388a34);
      background-color: rgba(56, 138, 52, 0.14);
    }
    .banner.err {
      border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
      background-color: var(--vscode-inputValidation-errorBackground, rgba(190, 17, 0, 0.16));
    }
    .hidden {
      display: none;
    }
    .inline-flex {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .inline-flex input {
      flex: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-row">
      <div>
        <h1 data-i18n="title"></h1>
        <p class="subtitle" data-i18n="subtitle"></p>
      </div>
      <div class="lang-box">
        <label for="uiLanguage" data-i18n="uiLanguageLabel"></label>
        <select id="uiLanguage">
          <option value="auto" data-i18n="uiLangAuto"></option>
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>

    <div class="section">
      <h2 data-i18n="presetHeading"></h2>
      <div class="preset-row">
        <button type="button" class="secondary" data-preset="ja-conv-single" data-i18n="presetJaConvSingle"></button>
        <button type="button" class="secondary" data-preset="ja-conv-body" data-i18n="presetJaConvBody"></button>
        <button type="button" class="secondary" data-preset="en-conv-single" data-i18n="presetEnConvSingle"></button>
        <button type="button" class="secondary" data-preset="ja-plain-single" data-i18n="presetJaPlainSingle"></button>
      </div>
      <div class="hint" data-i18n="presetHint"></div>
    </div>

    <div class="section">
      <h2 data-i18n="providerHeading"></h2>
      <div class="field">
        <label for="provider" data-i18n="providerLabel"></label>
        <select id="provider">
          <option value="copilot-cli" data-i18n="providerCopilot"></option>
          <option value="openai-compatible" data-i18n="providerOpenAi"></option>
        </select>
      </div>

      <div id="copilot-fields">
        <div class="grid-2">
          <div class="field">
            <label for="model" data-i18n="cliModelLabel"></label>
            <input type="text" id="model" placeholder="fusion" />
            <div class="hint" data-i18n="cliModelHint"></div>
          </div>
          <div class="field">
            <label for="reasoningEffort" data-i18n="effortLabel"></label>
            <select id="reasoningEffort">
              <option value="" data-i18n="effortDefault"></option>
              <option value="none">none</option>
              <option value="minimal">minimal</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="cliPath" data-i18n="cliPathLabel"></label>
          <input type="text" id="cliPath" placeholder="copilot" />
        </div>
        <div class="actions-row" style="margin-top: 8px;">
          <button type="button" class="secondary" id="openCopilotFeatures" data-i18n="openCopilotFeatures"></button>
        </div>
      </div>

      <div id="openai-fields" class="hidden">
        <div class="field">
          <label data-i18n="quickApiLabel"></label>
          <div class="quick-row">
            <button type="button" class="secondary" data-api="gemini">Google Gemini</button>
            <button type="button" class="secondary" data-api="openai">OpenAI</button>
            <button type="button" class="secondary" data-api="ollama" data-i18n="ollamaBtn"></button>
            <button type="button" class="secondary" data-api="openrouter">OpenRouter</button>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="apiBaseUrl" data-i18n="apiBaseUrlLabel"></label>
            <input type="text" id="apiBaseUrl" />
          </div>
          <div class="field">
            <label for="apiModel" data-i18n="apiModelLabel"></label>
            <input type="text" id="apiModel" />
          </div>
        </div>
        <div class="field">
          <label for="apiKeyInput" data-i18n="apiKeyLabel"></label>
          <div class="inline-flex">
            <input type="password" id="apiKeyInput" />
            <button type="button" class="secondary" id="clearApiKeyBtn" data-i18n="clearApiKey"></button>
          </div>
          <div class="hint" id="apiKeyStatus"></div>
        </div>
      </div>

      <div class="actions-row" style="margin-top: 14px;">
        <button type="button" id="testConnectionBtn" data-i18n="testConnection"></button>
      </div>
      <div id="testBanner" class="banner"></div>
    </div>

    <div class="section">
      <h2 data-i18n="formatHeading"></h2>
      <div class="grid-2">
        <div class="field">
          <label for="language" data-i18n="languageLabel"></label>
          <select id="language">
            <option value="ja" data-i18n="langJa"></option>
            <option value="en" data-i18n="langEn"></option>
            <option value="auto" data-i18n="langAuto"></option>
          </select>
        </div>
        <div class="field">
          <label for="style" data-i18n="styleLabel"></label>
          <select id="style">
            <option value="conventional" data-i18n="styleConv"></option>
            <option value="plain" data-i18n="stylePlain"></option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="checkbox-row">
          <input type="checkbox" id="includeBody" />
          <span data-i18n="includeBodyLabel"></span>
        </label>
      </div>
      <div class="field">
        <label class="checkbox-row">
          <input type="checkbox" id="fallbackToUnstaged" />
          <span data-i18n="fallbackLabel"></span>
        </label>
      </div>
      <div class="field">
        <label for="customInstructions" data-i18n="customInstLabel"></label>
        <textarea id="customInstructions"></textarea>
      </div>
    </div>

    <div class="section">
      <h2 data-i18n="advancedHeading"></h2>
      <div class="field">
        <label for="instructionFiles" data-i18n="instFilesLabel"></label>
        <textarea id="instructionFiles"></textarea>
      </div>
      <div class="field">
        <label for="excludePatterns" data-i18n="excludeLabel"></label>
        <textarea id="excludePatterns"></textarea>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="recentCommitsCount" data-i18n="recentCountLabel"></label>
          <input type="number" id="recentCommitsCount" min="0" max="50" />
        </div>
        <div class="field">
          <label for="maxDiffChars" data-i18n="maxDiffLabel"></label>
          <input type="number" id="maxDiffChars" min="1000" step="1000" />
        </div>
        <div class="field">
          <label for="timeoutSeconds" data-i18n="timeoutLabel"></label>
          <input type="number" id="timeoutSeconds" min="5" />
        </div>
      </div>
    </div>

    <div class="actions-row">
      <button type="button" id="saveBtn" data-i18n="saveBtn"></button>
      <button type="button" class="secondary" id="openRawSettingsBtn" data-i18n="openRawBtn"></button>
    </div>
    <div id="saveBanner" class="banner"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let clearApiKeyFlag = false;
    let currentHasApiKey = false;
    let currentEditorLang = 'en';

    const DICT = {
      ja: {
        title: 'Copilot CLI Commit Message 設定',
        subtitle: 'コミットメッセージ生成に使う接続先、出力スタイル、対象差分の範囲をまとめて管理できます。',
        uiLanguageLabel: '表示言語 / UI Language',
        uiLangAuto: 'エディタ設定に合わせる',
        presetHeading: 'かんたんプリセット',
        presetJaConvSingle: '日本語 Conventional 1行',
        presetJaConvBody: '日本語 Conventional 本文付き',
        presetEnConvSingle: '英語 Conventional 1行',
        presetJaPlainSingle: '日本語 シンプル 1行',
        presetHint: '押すと下の言語と書式の欄に反映されます。最後に保存ボタンを押してください。',
        presetApplied: 'プリセットを画面に反映しました。設定を保存するボタンを押して確定してください。',
        providerHeading: '接続先プロバイダーと動作確認',
        providerLabel: '使用するプロバイダー',
        providerCopilot: 'GitHub Copilot CLI',
        providerOpenAi: 'OpenAI 互換 API (Gemini / OpenAI / Ollama / OpenRouter)',
        cliModelLabel: 'Copilot CLI モデル名',
        cliModelHint: '空欄のまま保存すると既定の fusion が使われます。個別のモデルを使いたい場合はモデル名を入力してください。',
        effortLabel: '推論の深さ',
        effortDefault: '指定しない',
        cliPathLabel: 'Copilot CLI コマンドパス',
        openCopilotFeatures: 'GitHub Copilot Features 設定をブラウザで開く',
        quickApiLabel: 'よく使う接続先のクイック入力',
        ollamaBtn: 'Ollama ローカル',
        apiBaseUrlLabel: 'ベース URL',
        apiModelLabel: 'API モデル名',
        apiKeyLabel: 'API キー',
        apiKeyPlaceholder: '変更する場合のみ入力してください',
        clearApiKey: 'キーを削除',
        apiKeySaved: 'API キーは安全に保存されています。空欄のまま保存すると既存のキーを維持します。',
        apiKeyEmpty: 'API キーはまだ保存されていません。Ollama ローカル以外は入力してください。',
        apiKeyClearing: '保存すると既存の API キーを削除します。',
        testConnection: '現在の入力内容で接続テスト',
        testRunning: '接続テストを実行しています...',
        formatHeading: 'メッセージの書式と内容',
        languageLabel: '出力言語',
        langJa: '日本語',
        langEn: '英語',
        langAuto: '過去コミットに自動合わせ',
        styleLabel: '書式',
        styleConv: 'Conventional Commits (feat: / fix: など)',
        stylePlain: 'シンプル (プレフィックスなし)',
        includeBodyLabel: '1行目の要約に加えて箇条書きの本文も生成する',
        fallbackLabel: 'ステージングが空のときは未ステージの変更と新規ファイルも対象にする',
        customInstLabel: 'カスタム指示',
        customInstPlaceholder: '例: 変更したモジュール名を先頭に含めること',
        advancedHeading: 'コンテキストと詳細設定',
        instFilesLabel: '読み込むリポジトリ内規約ファイル (1行に1つ)',
        excludeLabel: '差分取得から除外するパターン (1行に1つ)',
        recentCountLabel: '参考にする直近コミット件数',
        maxDiffLabel: '差分の最大文字数',
        timeoutLabel: 'タイムアウト秒数',
        saveBtn: '設定を保存する',
        openRawBtn: 'VS Code 標準の設定画面を開く'
      },
      en: {
        title: 'Copilot CLI Commit Message Settings',
        subtitle: 'Configure the AI backend, commit message style, and diff collection rules in one place.',
        uiLanguageLabel: 'UI Language / 表示言語',
        uiLangAuto: 'Follow Editor Language',
        presetHeading: 'Quick Presets',
        presetJaConvSingle: 'Japanese Conventional (1-line)',
        presetJaConvBody: 'Japanese Conventional (with body)',
        presetEnConvSingle: 'English Conventional (1-line)',
        presetJaPlainSingle: 'Japanese Plain (1-line)',
        presetHint: 'Click a preset to update language and style below, then save settings.',
        presetApplied: 'Preset applied to the form. Click Save Settings to persist.',
        providerHeading: 'Backend Provider & Connection Test',
        providerLabel: 'Provider',
        providerCopilot: 'GitHub Copilot CLI',
        providerOpenAi: 'OpenAI-Compatible API (Gemini / OpenAI / Ollama / OpenRouter)',
        cliModelLabel: 'Copilot CLI Model',
        cliModelHint: 'Defaults to fusion when left empty. Enter another model ID if needed.',
        effortLabel: 'Reasoning Effort',
        effortDefault: 'Default',
        cliPathLabel: 'Copilot CLI Command Path',
        openCopilotFeatures: 'Open GitHub Copilot Features in Browser',
        quickApiLabel: 'Quick Fill Endpoints',
        ollamaBtn: 'Ollama Local',
        apiBaseUrlLabel: 'Base URL',
        apiModelLabel: 'API Model',
        apiKeyLabel: 'API Key',
        apiKeyPlaceholder: 'Enter only when setting or updating',
        clearApiKey: 'Clear Key',
        apiKeySaved: 'API key is securely stored. Leave blank to keep the existing key.',
        apiKeyEmpty: 'No API key saved yet. Required except for local Ollama.',
        apiKeyClearing: 'Existing API key will be removed on save.',
        testConnection: 'Test Connection with Current Form',
        testRunning: 'Testing connection...',
        formatHeading: 'Message Format & Scope',
        languageLabel: 'Commit Language',
        langJa: 'Japanese',
        langEn: 'English',
        langAuto: 'Match Recent Commits',
        styleLabel: 'Style',
        styleConv: 'Conventional Commits (feat:, fix:, etc.)',
        stylePlain: 'Plain (no prefix)',
        includeBodyLabel: 'Include bullet-point body lines after the subject',
        fallbackLabel: 'Include unstaged and untracked files when nothing is staged',
        customInstLabel: 'Custom Instructions',
        customInstPlaceholder: 'Example: Always mention the modified module name.',
        advancedHeading: 'Context & Advanced Limits',
        instFilesLabel: 'Repository Instruction Files (one per line)',
        excludeLabel: 'Exclude Diff Patterns (one per line)',
        recentCountLabel: 'Recent Commits Count',
        maxDiffLabel: 'Max Diff Characters',
        timeoutLabel: 'Timeout Seconds',
        saveBtn: 'Save Settings',
        openRawBtn: 'Open Standard VS Code Settings'
      }
    };

    const el = (id) => document.getElementById(id);

    function getActiveUiLang() {
      const val = el('uiLanguage').value;
      if (val === 'ja' || val === 'en') return val;
      return currentEditorLang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
    }

    function applyTranslations() {
      const lang = getActiveUiLang();
      const d = DICT[lang];
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-i18n]').forEach((node) => {
        const key = node.getAttribute('data-i18n');
        if (key && d[key]) {
          node.textContent = d[key];
        }
      });
      el('apiKeyInput').placeholder = d.apiKeyPlaceholder;
      el('customInstructions').placeholder = d.customInstPlaceholder;
      updateApiKeyStatusText();
    }

    function updateApiKeyStatusText() {
      const d = DICT[getActiveUiLang()];
      if (clearApiKeyFlag) {
        el('apiKeyStatus').textContent = d.apiKeyClearing;
      } else if (currentHasApiKey) {
        el('apiKeyStatus').textContent = d.apiKeySaved;
      } else {
        el('apiKeyStatus').textContent = d.apiKeyEmpty;
      }
    }

    function toggleProviderFields() {
      const isOpenAi = el('provider').value === 'openai-compatible';
      el('copilot-fields').classList.toggle('hidden', isOpenAi);
      el('openai-fields').classList.toggle('hidden', !isOpenAi);
    }

    function showBanner(elementId, ok, text) {
      const box = el(elementId);
      box.textContent = text;
      box.className = 'banner show ' + (ok ? 'ok' : 'err');
    }

    function linesToArray(text) {
      return text.split(/\\r?\\n/).map((s) => s.trim()).filter(Boolean);
    }

    function collectPayload() {
      return {
        config: {
          uiLanguage: el('uiLanguage').value,
          provider: el('provider').value,
          cliPath: el('cliPath').value,
          model: el('model').value,
          reasoningEffort: el('reasoningEffort').value,
          apiBaseUrl: el('apiBaseUrl').value,
          apiModel: el('apiModel').value,
          language: el('language').value,
          style: el('style').value,
          includeBody: el('includeBody').checked,
          fallbackToUnstaged: el('fallbackToUnstaged').checked,
          customInstructions: el('customInstructions').value,
          instructionFiles: linesToArray(el('instructionFiles').value),
          excludePatterns: linesToArray(el('excludePatterns').value),
          recentCommitsCount: Number(el('recentCommitsCount').value),
          maxDiffChars: Number(el('maxDiffChars').value),
          timeoutSeconds: Number(el('timeoutSeconds').value)
        },
        apiKeyInput: el('apiKeyInput').value,
        clearApiKey: clearApiKeyFlag
      };
    }

    function applyState(config, hasApiKey, editorLang) {
      currentHasApiKey = Boolean(hasApiKey);
      currentEditorLang = editorLang || 'en';
      el('uiLanguage').value = config.uiLanguage || 'auto';
      el('provider').value = config.provider || 'copilot-cli';
      el('cliPath').value = config.cliPath || 'copilot';
      el('model').value = config.model || 'fusion';
      el('reasoningEffort').value = config.reasoningEffort || '';
      el('apiBaseUrl').value = config.apiBaseUrl || '';
      el('apiModel').value = config.apiModel || '';
      el('language').value = config.language || 'ja';
      el('style').value = config.style || 'conventional';
      el('includeBody').checked = Boolean(config.includeBody);
      el('fallbackToUnstaged').checked = Boolean(config.fallbackToUnstaged);
      el('customInstructions').value = config.customInstructions || '';
      el('instructionFiles').value = (config.instructionFiles || []).join('\\n');
      el('excludePatterns').value = (config.excludePatterns || []).join('\\n');
      el('recentCommitsCount').value = config.recentCommitsCount ?? 10;
      el('maxDiffChars').value = config.maxDiffChars ?? 24000;
      el('timeoutSeconds').value = config.timeoutSeconds ?? 60;
      el('apiKeyInput').value = '';
      clearApiKeyFlag = false;
      toggleProviderFields();
      applyTranslations();
    }

    el('uiLanguage').addEventListener('change', applyTranslations);
    el('provider').addEventListener('change', toggleProviderFields);

    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        if (preset === 'ja-conv-single') {
          el('language').value = 'ja';
          el('style').value = 'conventional';
          el('includeBody').checked = false;
        } else if (preset === 'ja-conv-body') {
          el('language').value = 'ja';
          el('style').value = 'conventional';
          el('includeBody').checked = true;
        } else if (preset === 'en-conv-single') {
          el('language').value = 'en';
          el('style').value = 'conventional';
          el('includeBody').checked = false;
        } else if (preset === 'ja-plain-single') {
          el('language').value = 'ja';
          el('style').value = 'plain';
          el('includeBody').checked = false;
        }
        showBanner('saveBanner', true, DICT[getActiveUiLang()].presetApplied);
      });
    });

    document.querySelectorAll('[data-api]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-api');
        if (kind === 'gemini') {
          el('apiBaseUrl').value = 'https://generativelanguage.googleapis.com/v1beta/openai';
          el('apiModel').value = 'gemini-3.5-flash-lite';
        } else if (kind === 'openai') {
          el('apiBaseUrl').value = 'https://api.openai.com/v1';
          el('apiModel').value = 'gpt-4.1-mini';
        } else if (kind === 'ollama') {
          el('apiBaseUrl').value = 'http://localhost:11434/v1';
          el('apiModel').value = 'qwen2.5-coder:7b';
        } else if (kind === 'openrouter') {
          el('apiBaseUrl').value = 'https://openrouter.ai/api/v1';
          el('apiModel').value = 'google/gemini-2.5-flash';
        }
      });
    });

    el('clearApiKeyBtn').addEventListener('click', () => {
      clearApiKeyFlag = true;
      el('apiKeyInput').value = '';
      updateApiKeyStatusText();
    });

    el('saveBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'save', payload: collectPayload() });
    });

    el('testConnectionBtn').addEventListener('click', () => {
      showBanner('testBanner', true, DICT[getActiveUiLang()].testRunning);
      vscode.postMessage({ type: 'testConnection', payload: collectPayload() });
    });

    el('openCopilotFeatures').addEventListener('click', () => {
      vscode.postMessage({ type: 'openCopilotFeatures' });
    });

    el('openRawSettingsBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openRawSettings' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'state') {
        applyState(msg.config, msg.hasApiKey, msg.editorLang);
      } else if (msg.type === 'status') {
        showBanner('saveBanner', msg.ok, msg.message);
      } else if (msg.type === 'testResult') {
        showBanner('testBanner', msg.ok, msg.message);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  /**
   * パネル破棄時のクリーンアップ
   */
  private dispose(): void {
    SettingsPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length > 0) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}
