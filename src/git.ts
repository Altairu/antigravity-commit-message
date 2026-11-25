import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import type { DiffSource, ExtensionConfig, GitContext, GitExtensionExports, GitRepository } from './types';

const MAX_META_OUTPUT_CHARS = 512 * 1024;
const MAX_INSTRUCTIONS_CHARS = 4000;
const MAX_UNTRACKED_FILES = 20;
const MAX_UNTRACKED_FILE_CHARS = 4000;

/**
 * 未追跡の新規ファイル内容を統一 diff 風のテキストに整形する
 */
export function formatUntrackedFileDiff(filePath: string, content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  const isTruncated = normalized.length > MAX_UNTRACKED_FILE_CHARS;
  const body = isTruncated ? normalized.slice(0, MAX_UNTRACKED_FILE_CHARS) : normalized;
  const lines = body.split('\n').map((line) => `+${line}`);
  if (isTruncated) {
    lines.push('+... (ファイルが大きいため以降の行を省略しました)');
  }

  return [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines
  ].join('\n');
}

/**
 * 除外パターンを git diff 用のパススペック配列へ変換する
 */
export function buildExcludePathspecs(patterns: string[]): string[] {
  const cleaned = patterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);

  if (cleaned.length === 0) {
    return [];
  }

  return ['--', '.', ...cleaned.map((pattern) => `:(exclude)${pattern}`)];
}

/**
 * 差分文字列が上限を超える場合、改行境界を考慮して切り詰める
 */
export function truncateDiff(diff: string, maxChars: number): { text: string; truncated: boolean } {
  if (maxChars <= 0 || diff.length <= maxChars) {
    return { text: diff, truncated: false };
  }

  const slice = diff.slice(0, maxChars);
  const lastNewline = slice.lastIndexOf('\n');
  const cutIndex = lastNewline > Math.floor(maxChars * 0.7) ? lastNewline : maxChars;
  const notice = '\n\n... (差分が大きいため以降の行を省略しました)';

  return {
    text: `${diff.slice(0, cutIndex)}${notice}`,
    truncated: true
  };
}

/**
 * git コマンドをストリーミングで実行して標準出力を返す
 * 出力上限に達した場合はその時点でプロセスを終了し、取得済みデータのみ返す
 */
function runGitCommand(args: string[], cwd: string, maxOutputChars?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', '-c', 'core.safecrlf=false', ...args], {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let reachedLimit = false;

    const finishResolve = (output: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(output);
    };

    const finishReject = (err: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(err);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      if (reachedLimit) {
        return;
      }
      stdout += chunk;
      if (maxOutputChars !== undefined && maxOutputChars > 0 && stdout.length > maxOutputChars) {
        reachedLimit = true;
        const truncated = stdout.slice(0, maxOutputChars);
        child.kill();
        finishResolve(truncated);
      }
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (reachedLimit) {
        return;
      }
      const stderrText = stderr.trim();
      const detail = stderrText ? `${error.message} (${stderrText})` : error.message;
      finishReject(new Error(`git ${args[0] ?? ''} の実行に失敗しました: ${detail}`));
    });

    child.on('close', (code) => {
      if (reachedLimit || code === 0) {
        finishResolve(stdout);
        return;
      }
      const stderrText = stderr.trim();
      const detail = stderrText
        ? `exit code ${code ?? 'unknown'} - ${stderrText}`
        : `exit code ${code ?? 'unknown'}`;
      finishReject(new Error(`git ${args[0] ?? ''} の実行に失敗しました: ${detail}`));
    });
  });
}

/**
 * 実行エラーを無視して git コマンドを実行し、失敗時は空文字を返す
 */
async function tryRunGitCommand(args: string[], cwd: string, maxOutputChars?: number): Promise<string> {
  try {
    return await runGitCommand(args, cwd, maxOutputChars);
  } catch {
    return '';
  }
}

/**
 * VS Code 組み込み Git 拡張から対象リポジトリを解決する
 */
export async function resolveGitRepository(sourceControl?: vscode.SourceControl): Promise<GitRepository | undefined> {
  // テスト環境で vscode モジュールを読み込まないよう、実行時に取得する
  const vscodeApi = require('vscode') as typeof import('vscode');
  const gitExtension = vscodeApi.extensions.getExtension<GitExtensionExports>('vscode.git');

  if (!gitExtension) {
    throw new Error('VS Code の組み込み Git 拡張が見つかりません。');
  }

  const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const gitApi = exports.getAPI(1);
  const repositories = gitApi.repositories;

  if (repositories.length === 0) {
    throw new Error('開かれている Git リポジトリが見つかりません。');
  }

  if (sourceControl?.rootUri) {
    const targetPath = sourceControl.rootUri.fsPath;
    const matched = repositories.find((repo) => repo.rootUri.fsPath === targetPath);
    if (matched) {
      return matched;
    }
  }

  if (repositories.length === 1) {
    return repositories[0];
  }

  const picked = await vscodeApi.window.showQuickPick(
    repositories.map((repo) => ({
      label: path.basename(repo.rootUri.fsPath) || repo.rootUri.fsPath,
      description: repo.rootUri.fsPath,
      repo
    })),
    {
      placeHolder: 'コミットメッセージを生成するリポジトリを選択してください'
    }
  );

  return picked?.repo;
}

/**
 * リポジトリ内の規約ファイルを読み込んで結合する
 */
async function readInstructionFiles(repoRoot: string, files: string[]): Promise<string> {
  const chunks: string[] = [];
  let totalLength = 0;

  for (const relativePath of files) {
    const trimmed = relativePath.trim();
    if (!trimmed) {
      continue;
    }

    const fullPath = path.resolve(repoRoot, trimmed);
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      const normalized = content.trim();
      if (!normalized) {
        continue;
      }

      const remaining = MAX_INSTRUCTIONS_CHARS - totalLength;
      if (remaining <= 0) {
        break;
      }

      const body = normalized.length > remaining ? normalized.slice(0, remaining) : normalized;
      chunks.push(`# ${trimmed}\n${body}`);
      totalLength += body.length;
    } catch {
      // ファイルが存在しない場合はスキップする
    }
  }

  return chunks.join('\n\n');
}

/**
 * コミットメッセージ生成に必要な Git コンテキストを収集する
 */
export async function collectGitContext(repoRoot: string, config: ExtensionConfig): Promise<GitContext> {
  const excludeSpecs = buildExcludePathspecs(config.excludePatterns);
  const maxDiffReadChars = config.maxDiffChars + 4096;

  let source: DiffSource = 'staged';
  let stat = (await runGitCommand(['diff', '--cached', '--stat', ...excludeSpecs], repoRoot, MAX_META_OUTPUT_CHARS)).trim();
  let rawDiff = await runGitCommand(['diff', '--cached', ...excludeSpecs], repoRoot, maxDiffReadChars);

  // ステージング差分が空で、未ステージフォールバックが有効な場合のみ未ステージ差分と未追跡ファイルを取得する
  if (!rawDiff.trim() && config.fallbackToUnstaged) {
    const unstagedStat = (await runGitCommand(['diff', '--stat', ...excludeSpecs], repoRoot, MAX_META_OUTPUT_CHARS)).trim();
    const unstagedDiff = await runGitCommand(['diff', ...excludeSpecs], repoRoot, maxDiffReadChars);

    const untrackedOutput = await tryRunGitCommand(
      ['ls-files', '--others', '--exclude-standard', ...excludeSpecs],
      repoRoot,
      MAX_META_OUTPUT_CHARS
    );
    const untrackedFiles = untrackedOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, MAX_UNTRACKED_FILES);

    const untrackedDiffs: string[] = [];
    const untrackedStatLines: string[] = [];

    for (const relPath of untrackedFiles) {
      const fullPath = path.resolve(repoRoot, relPath);
      try {
        const buffer = await fs.readFile(fullPath);
        // NUL バイトを含む場合はバイナリファイルとみなして中身をスキップする
        if (buffer.includes(0)) {
          untrackedStatLines.push(` ${relPath} | (binary untracked file)`);
          continue;
        }
        const content = buffer.toString('utf8');
        untrackedDiffs.push(formatUntrackedFileDiff(relPath, content));
        untrackedStatLines.push(` ${relPath} | (new untracked file)`);
      } catch {
        // 読み込みに失敗したファイルはスキップする
      }
    }

    const combinedDiff = [unstagedDiff.trim(), ...untrackedDiffs].filter((part) => part.length > 0).join('\n\n');
    if (combinedDiff.length > 0) {
      source = 'unstaged';
      stat = [unstagedStat, ...untrackedStatLines].filter((part) => part.length > 0).join('\n');
      rawDiff = combinedDiff;
    }
  }

  const { text: diff, truncated: diffTruncated } = truncateDiff(rawDiff.trim(), config.maxDiffChars);
  const branchName = (await tryRunGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)).trim();

  let recentCommits: string[] = [];
  if (config.recentCommitsCount > 0) {
    const logOutput = await tryRunGitCommand(
      ['log', '-n', String(config.recentCommitsCount), '--pretty=format:%s'],
      repoRoot
    );
    recentCommits = logOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  const instructionsText = await readInstructionFiles(repoRoot, config.instructionFiles);

  return {
    branchName,
    recentCommits,
    instructionsText,
    stat,
    diff,
    diffTruncated,
    source
  };
}
