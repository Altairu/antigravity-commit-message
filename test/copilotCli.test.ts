import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildCopilotArgs, classifyCopilotError, classifyCopilotErrorDetail } from '../src/copilotCli';
import type { ExtensionConfig } from '../src/types';

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
    instructionFiles: [],
    recentCommitsCount: 10,
    maxDiffChars: 24000,
    excludePatterns: [],
    fallbackToUnstaged: false,
    timeoutSeconds: 60,
    ...overrides
  };
}

describe('buildCopilotArgs', () => {
  it('既定設定ではモデルに fusion を指定して返すこと', () => {
    const args = buildCopilotArgs(createConfig());
    assert.deepEqual(args, [
      '-s',
      '--stream',
      'off',
      '--no-color',
      '--disable-builtin-mcps',
      '--no-custom-instructions',
      '--no-ask-user',
      '--no-auto-update',
      '--model',
      'fusion'
    ]);
  });

  it('model と reasoningEffort が指定された場合に引数へ追加されること', () => {
    const args = buildCopilotArgs(createConfig({ model: 'gpt-5-mini', reasoningEffort: 'low' }));
    assert.ok(args.includes('--model'));
    assert.ok(args.includes('gpt-5-mini'));
    assert.ok(args.includes('--reasoning-effort'));
    assert.ok(args.includes('low'));
  });
});

describe('classifyCopilotError', () => {
  it('ENOENT の場合に CLI 未検出の案内メッセージを返すこと', () => {
    const err = Object.assign(new Error('spawn copilot ENOENT'), { code: 'ENOENT' });
    const detail = classifyCopilotErrorDetail('', '', err);
    assert.equal(detail.kind, 'not_found');
    assert.match(detail.message, /copilot CLI が見つかりません/);
  });

  it('Windows や POSIX シェルのコマンド未検出エラーを not_found として分類すること', () => {
    const winDetail = classifyCopilotErrorDetail(
      "'copilot' is not recognized as an internal or external command,",
      ''
    );
    assert.equal(winDetail.kind, 'not_found');

    const posixDetail = classifyCopilotErrorDetail('sh: 1: copilot: command not found', '');
    assert.equal(posixDetail.kind, 'not_found');
  });

  it('No supported model available の場合にプラン制限等の詳細案内を返すこと', () => {
    const detail = classifyCopilotErrorDetail('Error: No supported model available', '');
    assert.equal(detail.kind, 'model_unavailable');
    assert.match(detail.message, /Copilot CLI で利用可能なモデルが見つかりませんでした/);
    assert.match(detail.message, /OpenAI 互換 API/);
  });

  it('認証エラーの場合にログイン案内を返すこと', () => {
    const message = classifyCopilotError('401 Unauthorized', '');
    assert.match(message, /認証に失敗しました/);
  });

  it('英語モードでは英語のエラーメッセージを返すこと', () => {
    const detail = classifyCopilotErrorDetail('Error: No supported model available', '', undefined, 'en');
    assert.equal(detail.kind, 'model_unavailable');
    assert.match(detail.message, /No supported Copilot CLI model was found/);
  });
});
