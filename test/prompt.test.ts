import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildCommitPrompt, cleanCommitMessage } from '../src/prompt';
import type { ExtensionConfig, GitContext } from '../src/types';

/**
 * テスト用の標準設定を生成する
 */
function createConfig(overrides: Partial<ExtensionConfig> = {}): ExtensionConfig {
  return {
    uiLanguage: 'auto',
    provider: 'copilot-cli',
    cliPath: 'copilot',
    model: '',
    reasoningEffort: '',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiModel: 'gemini-2.5-flash',
    language: 'ja',
    style: 'conventional',
    includeBody: false,
    customInstructions: '',
    instructionFiles: ['.github/copilot-instructions.md'],
    recentCommitsCount: 10,
    maxDiffChars: 24000,
    excludePatterns: [],
    fallbackToUnstaged: false,
    timeoutSeconds: 60,
    ...overrides
  };
}

/**
 * テスト用の標準 Git コンテキストを生成する
 */
function createContext(overrides: Partial<GitContext> = {}): GitContext {
  return {
    branchName: 'feat/commit-gen',
    recentCommits: ['feat: 初期構成を追加', 'fix: 設定読み込みの不具合を修正'],
    instructionsText: '',
    stat: ' src/extension.ts | 10 ++++++++++',
    diff: 'diff --git a/src/extension.ts b/src/extension.ts\n+console.log("ok");',
    diffTruncated: false,
    source: 'staged',
    ...overrides
  };
}

describe('buildCommitPrompt', () => {
  it('日本語・Conventional Commits・単一行の設定がプロンプトに反映されること', () => {
    const prompt = buildCommitPrompt(createContext(), createConfig());

    assert.match(prompt, /Write the commit message in Japanese/);
    assert.match(prompt, /Use Conventional Commits format/);
    assert.match(prompt, /Output ONLY a single-line subject/);
    assert.match(prompt, /## Current Branch\nfeat\/commit-gen/);
    assert.match(prompt, /## Recent Commits/);
    assert.match(prompt, /## Staged Change Summary/);
    assert.match(prompt, /## Staged Diff/);
  });

  it('英語・plain・本文ありの設定とカスタム指示が反映されること', () => {
    const prompt = buildCommitPrompt(
      createContext({ source: 'unstaged', instructionsText: '# rules\n- ルール1' }),
      createConfig({
        language: 'en',
        style: 'plain',
        includeBody: true,
        customInstructions: 'モジュール名を明記すること'
      })
    );

    assert.match(prompt, /Write the commit message in English/);
    assert.match(prompt, /without any Conventional Commits prefix/);
    assert.match(prompt, /concise bullet points/);
    assert.match(prompt, /## Repository & User Instructions/);
    assert.match(prompt, /モジュール名を明記すること/);
    assert.match(prompt, /## Unstaged Diff/);
  });
});

describe('cleanCommitMessage', () => {
  it('コードフェンスや前置きラベルを除去すること', () => {
    const raw = '```text\nCommit message: feat(git): ステージング差分のみを取得するよう改善\n```';
    assert.equal(cleanCommitMessage(raw), 'feat(git): ステージング差分のみを取得するよう改善');
  });

  it('日本語ラベルや余分な連続改行を整理すること', () => {
    const raw = 'コミットメッセージ: feat: 新機能を追加\n\n\n\n- 詳細1\n- 詳細2\n';
    assert.equal(cleanCommitMessage(raw), 'feat: 新機能を追加\n\n- 詳細1\n- 詳細2');
  });

  it('空文字や空白のみの入力では空文字を返すこと', () => {
    assert.equal(cleanCommitMessage('   \r\n  '), '');
  });
});
