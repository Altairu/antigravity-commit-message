import * as vscode from 'vscode';
import { promptAndRunCliInstall } from './cliInstaller';
import { getApiKey, getExtensionConfig } from './config';
import { CancelledError, ProviderError, runCopilotCli } from './copilotCli';
import { collectGitContext, resolveGitRepository } from './git';
import { getMessages, resolveUiLanguage } from './i18n';
import { runOpenAiCompatible } from './openaiClient';
import { buildCommitPrompt, cleanCommitMessage } from './prompt';
import { SettingsPanel } from './settingsPanel';
import type { ResolvedUiLanguage } from './types';

const COPILOT_FEATURES_URL = 'https://github.com/settings/copilot/features';

/**
 * エラー通知を表示し、設定画面やログなどへのワンクリック誘導ボタンを提供する
 */
async function showActionableError(
  error: unknown,
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  lang: ResolvedUiLanguage
): Promise<void> {
  const m = getMessages(lang);
  const errorMessage = error instanceof Error ? error.message : String(error);
  outputChannel.appendLine(`[ERROR] ${errorMessage}`);

  const actions = [m.actionOpenSettings, m.actionViewLogs];
  if (error instanceof ProviderError && error.kind === 'not_found') {
    actions.unshift(m.actionInstallCli);
  } else if (error instanceof ProviderError && (error.kind === 'model_unavailable' || error.kind === 'auth')) {
    actions.push(m.actionOpenCopilotSettings);
  }

  const picked = await vscode.window.showErrorMessage(errorMessage, ...actions);
  if (picked === m.actionInstallCli) {
    await promptAndRunCliInstall(lang, outputChannel);
  } else if (picked === m.actionOpenSettings) {
    SettingsPanel.createOrShow(context, outputChannel);
  } else if (picked === m.actionViewLogs) {
    outputChannel.show(true);
  } else if (picked === m.actionOpenCopilotSettings) {
    await vscode.env.openExternal(vscode.Uri.parse(COPILOT_FEATURES_URL));
  }
}

/**
 * 拡張機能のアクティベーション処理
 */
export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Copilot CLI Commit Message');

  const openSettingsCommand = vscode.commands.registerCommand('copilotCliCommit.openSettings', () => {
    SettingsPanel.createOrShow(context, outputChannel);
  });

  const installCliCommand = vscode.commands.registerCommand('copilotCliCommit.installCli', async () => {
    const config = getExtensionConfig();
    const uiLang = resolveUiLanguage(config.uiLanguage, vscode.env.language);
    await promptAndRunCliInstall(uiLang, outputChannel);
  });

  const generateCommand = vscode.commands.registerCommand(
    'copilotCliCommit.generate',
    async (sourceControl?: vscode.SourceControl) => {
      const config = getExtensionConfig();
      const uiLang = resolveUiLanguage(config.uiLanguage, vscode.env.language);
      const m = getMessages(uiLang);

      try {
        const repository = await resolveGitRepository(sourceControl);
        if (!repository) {
          return;
        }

        const repoRoot = repository.rootUri.fsPath;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.SourceControl,
            title: m.progressTitle,
            cancellable: true
          },
          async (_progress, token) => {
            const gitContext = await collectGitContext(repoRoot, config);

            if (!gitContext.diff) {
              const message = config.fallbackToUnstaged ? m.noStagedAndUnstaged : m.noStagedOnly;
              void vscode.window.showInformationMessage(message);
              return;
            }

            if (gitContext.diffTruncated) {
              outputChannel.appendLine(
                `[INFO] 差分サイズが上限 (${config.maxDiffChars} 文字) を超えたため切り詰めました。`
              );
            }

            const prompt = buildCommitPrompt(gitContext, config);
            outputChannel.appendLine(
              `[INFO] コミットメッセージを生成します (provider: ${config.provider}, cwd: ${repoRoot}, source: ${gitContext.source})`
            );

            let rawOutput: string;
            if (config.provider === 'openai-compatible') {
              const apiKey = await getApiKey(context.secrets);
              rawOutput = await runOpenAiCompatible(prompt, config, apiKey, token, uiLang);
            } else {
              rawOutput = await runCopilotCli(prompt, repoRoot, config, token, uiLang);
            }

            const commitMessage = cleanCommitMessage(rawOutput);

            if (!commitMessage) {
              void vscode.window.showWarningMessage(m.emptyModelResponse);
              return;
            }

            repository.inputBox.value = commitMessage;
            outputChannel.appendLine('[INFO] コミットメッセージを入力欄に設定しました。');
          }
        );
      } catch (error) {
        if (error instanceof CancelledError) {
          outputChannel.appendLine('[INFO] コミットメッセージの生成がキャンセルされました。');
          return;
        }
        await showActionableError(error, context, outputChannel, uiLang);
      }
    }
  );

  context.subscriptions.push(outputChannel, openSettingsCommand, installCliCommand, generateCommand);
}

/**
 * 拡張機能の非アクティベーション処理
 */
export function deactivate(): void {
  // 現時点で解放すべき追加リソースはなし
}
