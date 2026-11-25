import type { ExtensionConfig, GitContext } from './types';

/**
 * 言語設定に応じた指示文を返す
 */
function buildLanguageInstruction(config: ExtensionConfig): string {
  switch (config.language) {
    case 'ja':
      return 'Write the commit message in Japanese (日本語).';
    case 'en':
      return 'Write the commit message in English.';
    case 'auto':
      return 'Match the language used in the recent commit history of this repository. If unclear, use Japanese.';
  }
}

/**
 * 書式設定に応じた指示文を返す
 */
function buildStyleInstruction(config: ExtensionConfig): string {
  if (config.style === 'conventional') {
    return [
      'Use Conventional Commits format for the subject line: <type>(<optional-scope>): <subject>',
      'Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.',
      'Keep the subject line concise (around 50-72 characters) and focus on why and what changed.'
    ].join('\n');
  }

  return 'Write a concise single-line summary without any Conventional Commits prefix.';
}

/**
 * Copilot CLI に渡すプロンプト文字列を組み立てる
 */
export function buildCommitPrompt(context: GitContext, config: ExtensionConfig): string {
  const sections: string[] = [];

  sections.push(
    [
      'You are an expert software engineer writing a precise Git commit message.',
      'Analyze the provided repository context, change summary, and diff carefully.',
      buildLanguageInstruction(config),
      buildStyleInstruction(config),
      config.includeBody
        ? 'After the subject line, add a blank line and write concise bullet points (- ...) explaining the key changes and motivation.'
        : 'Output ONLY a single-line subject without a body.',
      'CRITICAL OUTPUT RULES:',
      '- Output ONLY the commit message text itself.',
      '- Do NOT include explanations, greetings, labels (like "Commit message:"), or markdown code fences (```).'
    ].join('\n')
  );

  if (context.branchName) {
    sections.push(`## Current Branch\n${context.branchName}`);
  }

  if (context.recentCommits.length > 0) {
    sections.push(
      `## Recent Commits (style reference)\n${context.recentCommits.map((c) => `- ${c}`).join('\n')}`
    );
  }

  const rulesParts: string[] = [];
  if (context.instructionsText.trim()) {
    rulesParts.push(context.instructionsText.trim());
  }
  if (config.customInstructions.trim()) {
    rulesParts.push(config.customInstructions.trim());
  }
  if (rulesParts.length > 0) {
    sections.push(`## Repository & User Instructions\n${rulesParts.join('\n\n')}`);
  }

  const diffLabel = context.source === 'staged' ? 'Staged' : 'Unstaged';

  if (context.stat) {
    sections.push(`## ${diffLabel} Change Summary\n${context.stat}`);
  }

  sections.push(`## ${diffLabel} Diff\n${context.diff}`);

  return sections.join('\n\n');
}

/**
 * モデル出力から不要な装飾やコードフェンスを取り除き、コミットメッセージ本文を抽出する
 */
export function cleanCommitMessage(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) {
    return '';
  }

  // 全体が Markdown コードフェンスで囲まれている場合は中身を取り出す
  const fencedMatch = text.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  if (fencedMatch) {
    text = fencedMatch[1].trim();
  }

  // 先頭に付与されがちなラベル文字列を除去する
  text = text.replace(/^(?:commit\s*message|コミットメッセージ)\s*[:：]\s*/i, '').trim();

  // 連続する 3 つ以上の改行を 2 つに圧縮する
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}
