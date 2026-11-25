# Copilot CLI Commit Message

For Japanese documentation, see the bundled `README.md` file.

An extension for Antigravity IDE and VS Code-compatible editors that generates accurate, repository-aware Git commit messages using GitHub Copilot CLI or OpenAI-compatible APIs such as Google Gemini, OpenAI, Ollama, and OpenRouter.

## Features

* Prioritizes staged changes (`git diff --cached`) and automatically falls back to unstaged and untracked changes only when nothing is staged.
* Enriches the prompt with change summary (`--stat`), branch name, recent commit history, repository instruction files, and custom instructions.
* Excludes noisy files such as lockfiles and minified assets, and streams large diffs safely without hitting `maxBuffer` limits.
* Includes a dedicated Settings GUI panel with instant Japanese / English UI language switching, one-click presets, connection testing, and secure API key storage via VS Code `SecretStorage`.
* Provides actionable error notifications with one-click buttons to open settings, view logs, or open GitHub Copilot Features settings.

## Installation

### From Antigravity IDE / Open VSX Registry

* Open the Extensions view in Antigravity IDE or any Open VSX-compatible editor, search for `Copilot CLI Commit Message` or `Altairu.copilot-cli-commit-message`, and install it.
* Open VSX Registry page: https://open-vsx.org/extension/Altairu/copilot-cli-commit-message

### From Visual Studio Marketplace (VS Code)

* Search for `Altairu.copilot-cli-commit-message` in the VS Code Extensions view and click Install.
* Or install via CLI: `code --install-extension Altairu.copilot-cli-commit-message`
* Visual Studio Marketplace page: https://marketplace.visualstudio.com/items?itemName=Altairu.copilot-cli-commit-message

### Manual Installation from GitHub Releases (VSIX)

* Download the latest `.vsix` file from GitHub Releases: https://github.com/Altairu/antigravity-commit-message/releases
* Open the Extensions view, click the `...` menu, select `Install from VSIX...`, and choose the downloaded `.vsix` file.

## Quick Start

* Click the gear icon in the Source Control panel title bar to open the dedicated Settings GUI.
* Choose either `GitHub Copilot CLI` or `OpenAI-Compatible API`, then configure your model or API key.
* Click `Test Connection with Current Form` to verify connectivity, and click `Save Settings`.

## Prerequisites & Setup

### Using GitHub Copilot CLI

* Install GitHub Copilot CLI and authenticate with `copilot login`.
* Set the Copilot CLI model to `fusion` (the default in this extension) to use Copilot Fusion, or specify another model allowed by your plan.

### Using OpenAI-Compatible APIs

* Open the dedicated Settings GUI from the gear icon in the Source Control title bar.
* Switch Provider to `OpenAI-Compatible API`.
* Use the quick-fill buttons for Google Gemini, OpenAI, Ollama Local, or OpenRouter, enter your API key if required, and click Test Connection.

## Usage

* Click the sparkle icon in the Source Control panel or run `Generate Commit Message with Copilot CLI` from the Command Palette.
* Click the gear icon in the Source Control panel or run `Open Copilot CLI Commit Settings` to open the Settings GUI.

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| `copilotCliCommit.uiLanguage` | Extension UI display language (`auto`, `ja`, `en`) | `auto` |
| `copilotCliCommit.provider` | Backend provider (`copilot-cli`, `openai-compatible`) | `copilot-cli` |
| `copilotCliCommit.language` | Generated commit message language (`ja`, `en`, `auto`) | `ja` |
| `copilotCliCommit.style` | Commit format (`conventional`, `plain`) | `conventional` |
| `copilotCliCommit.includeBody` | Include bullet-point body lines | `false` |
| `copilotCliCommit.model` | Copilot CLI model name | `fusion` |
| `copilotCliCommit.reasoningEffort` | Copilot CLI reasoning effort | `""` |
| `copilotCliCommit.cliPath` | Copilot CLI executable or command name | `copilot` |
| `copilotCliCommit.apiBaseUrl` | Base URL for OpenAI-compatible API | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `copilotCliCommit.apiModel` | Model name for OpenAI-compatible API | `gemini-3.5-flash-lite` |
| `copilotCliCommit.fallbackToUnstaged` | Fall back to unstaged/untracked changes when staged diff is empty | `true` |
| `copilotCliCommit.customInstructions` | Custom instructions appended to the prompt | `""` |
| `copilotCliCommit.instructionFiles` | Repository instruction file paths | `[".github/copilot-instructions.md"]` |
| `copilotCliCommit.recentCommitsCount` | Number of recent commits for style reference | `10` |
| `copilotCliCommit.maxDiffChars` | Maximum diff characters sent to the model | `24000` |
| `copilotCliCommit.excludePatterns` | Excluded file patterns | Lockfiles and minified assets |
| `copilotCliCommit.timeoutSeconds` | Timeout in seconds | `60` |

## Development

* Install dependencies: `npm install`
* Typecheck, build, and test: `npm run typecheck && npm run build && npm test`
* Package VSIX: `npm run package`
* Automated GitHub Releases: Push a tag matching `v*` (for example `git tag v0.x.y && git push origin v0.x.y`) to trigger GitHub Actions to run checks, build the `.vsix`, and publish a GitHub Release.
* Automated Marketplace & Open VSX Publishing: Configure Trusted Publishing (OIDC) on Visual Studio Marketplace for this repository and `release.yml`, and add `OVSX_PAT` to your GitHub repository Secrets to automatically publish to both Visual Studio Marketplace (without a PAT) and Open VSX Registry on tag push.

## License

Licensed under the MIT License. See the bundled `LICENSE` file for details.
