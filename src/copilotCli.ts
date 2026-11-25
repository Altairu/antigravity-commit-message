import { spawn } from 'node:child_process';
import { getMessages } from './i18n';
import type { CancellationLike, ExtensionConfig, ResolvedUiLanguage } from './types';

/**
 * プロバイダー実行時のエラー種別
 */
export type CopilotErrorKind = 'not_found' | 'model_unavailable' | 'auth' | 'timeout' | 'other';

/**
 * エラー種別を保持するプロバイダー共通エラー
 */
export class ProviderError extends Error {
  readonly kind: CopilotErrorKind;

  constructor(kind: CopilotErrorKind, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
  }
}

/**
 * ユーザーによるキャンセルを表すエラー
 */
export class CancelledError extends Error {
  constructor() {
    super('Operation cancelled.');
    this.name = 'CancelledError';
  }
}

/**
 * 拡張機能の設定から Copilot CLI の起動引数配列を組み立てる
 */
export function buildCopilotArgs(config: ExtensionConfig): string[] {
  const args = [
    '-s',
    '--stream',
    'off',
    '--no-color',
    '--disable-builtin-mcps',
    '--no-custom-instructions',
    '--no-ask-user',
    '--no-auto-update'
  ];

  const model = config.model.trim() || 'fusion';
  args.push('--model', model);

  const reasoningEffort = config.reasoningEffort.trim();
  if (reasoningEffort.length > 0) {
    args.push('--reasoning-effort', reasoningEffort);
  }

  return args;
}

/**
 * Copilot CLI のエラー出力から種別と表示言語に応じたメッセージを決定する
 */
export function classifyCopilotErrorDetail(
  stderr: string,
  stdout: string,
  error?: NodeJS.ErrnoException,
  lang: ResolvedUiLanguage = 'ja'
): { kind: CopilotErrorKind; message: string } {
  const m = getMessages(lang);

  if (error?.code === 'ENOENT') {
    return {
      kind: 'not_found',
      message: m.cliNotFound
    };
  }

  const combined = `${stderr}\n${stdout}`.trim();

  if (/no supported model available/i.test(combined) || /model .* is not available/i.test(combined)) {
    return {
      kind: 'model_unavailable',
      message: m.modelUnavailable
    };
  }

  if (/not logged in|unauthorized|authentication|401/i.test(combined)) {
    return {
      kind: 'auth',
      message: m.cliAuthFailed
    };
  }

  if (combined.length > 0) {
    return {
      kind: 'other',
      message: `${m.cliFailedPrefix}: ${combined}`
    };
  }

  if (error?.message) {
    return {
      kind: 'other',
      message: `${m.cliFailedPrefix}: ${error.message}`
    };
  }

  return {
    kind: 'other',
    message: `${m.cliFailedPrefix}.`
  };
}

/**
 * エラーメッセージ文字列のみを返す互換ヘルパー
 */
export function classifyCopilotError(
  stderr: string,
  stdout: string,
  error?: NodeJS.ErrnoException,
  lang: ResolvedUiLanguage = 'ja'
): string {
  return classifyCopilotErrorDetail(stderr, stdout, error, lang).message;
}

/**
 * Copilot CLI を非対話モードで実行し、標準入力からプロンプトを渡して応答を返す
 */
export function runCopilotCli(
  prompt: string,
  cwd: string,
  config: ExtensionConfig,
  token?: CancellationLike,
  lang: ResolvedUiLanguage = 'ja'
): Promise<string> {
  if (token?.isCancellationRequested) {
    return Promise.reject(new CancelledError());
  }

  const m = getMessages(lang);
  const args = buildCopilotArgs(config);

  return new Promise((resolve, reject) => {
    const child = spawn(config.cliPath, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let cancelled = false;

    const cleanup = (): void => {
      clearTimeout(timer);
      cancelDisposable?.dispose();
    };

    const finishReject = (err: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(err);
    };

    const finishResolve = (output: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(output);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      finishReject(new ProviderError('timeout', m.cliTimeout(config.timeoutSeconds)));
    }, config.timeoutSeconds * 1000);

    const cancelDisposable = token?.onCancellationRequested(() => {
      cancelled = true;
      child.kill();
      finishReject(new CancelledError());
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (cancelled || timedOut) {
        return;
      }
      const detail = classifyCopilotErrorDetail(stderr, stdout, err, lang);
      finishReject(new ProviderError(detail.kind, detail.message));
    });

    child.on('close', (code) => {
      if (cancelled || timedOut) {
        return;
      }
      if (code === 0) {
        finishResolve(stdout);
        return;
      }
      const detail = classifyCopilotErrorDetail(stderr, stdout, undefined, lang);
      finishReject(new ProviderError(detail.kind, detail.message));
    });

    // Windows のコマンドライン長制限を回避するため、標準入力経由でプロンプトを送信する
    child.stdin.on('error', () => {
      // 子プロセスが早期終了した場合の EPIPE を握りつぶし、close イベント側でエラーを処理する
    });
    child.stdin.write(prompt, 'utf8');
    child.stdin.end();
  });
}
