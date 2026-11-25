import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildExcludePathspecs, formatUntrackedFileDiff, truncateDiff } from '../src/git';

describe('buildExcludePathspecs', () => {
  it('空配列や空白のみの要素を無視して正しいパススペックを返すこと', () => {
    assert.deepEqual(buildExcludePathspecs([]), []);
    assert.deepEqual(buildExcludePathspecs(['', '   ']), []);
    assert.deepEqual(buildExcludePathspecs(['package-lock.json', ' *.min.js ']), [
      '--',
      '.',
      ':(exclude)package-lock.json',
      ':(exclude)*.min.js'
    ]);
  });
});

describe('truncateDiff', () => {
  it('上限以下の差分はそのまま返し truncated が false になること', () => {
    const diff = 'line1\nline2\nline3';
    const result = truncateDiff(diff, 100);
    assert.equal(result.text, diff);
    assert.equal(result.truncated, false);
  });

  it('上限を超える差分は改行境界で切り詰められ注記が付くこと', () => {
    const diff = `${'a'.repeat(80)}\n${'b'.repeat(80)}\n${'c'.repeat(80)}`;
    const result = truncateDiff(diff, 100);
    assert.equal(result.truncated, true);
    assert.match(result.text, /\.\.\. \(差分が大きいため以降の行を省略しました\)$/);
    assert.ok(result.text.startsWith('a'.repeat(80)));
  });
});

describe('formatUntrackedFileDiff', () => {
  it('新規ファイルの内容を統一 diff 風のテキストに整形すること', () => {
    const formatted = formatUntrackedFileDiff('src/new.ts', 'const a = 1;\r\nconst b = 2;');
    assert.match(formatted, /^diff --git a\/src\/new\.ts b\/src\/new\.ts/m);
    assert.match(formatted, /^new file mode 100644$/m);
    assert.match(formatted, /^\+const a = 1;$/m);
    assert.match(formatted, /^\+const b = 2;$/m);
  });

  it('サイズ上限を超える新規ファイルは切り詰めて省略注記を付けること', () => {
    const longContent = 'x'.repeat(5000);
    const formatted = formatUntrackedFileDiff('src/large.txt', longContent);
    assert.match(formatted, /\+\.\.\. \(ファイルが大きいため以降の行を省略しました\)/);
  });
});
