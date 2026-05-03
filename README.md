# Repo Why

**Understand any codebase in minutes.** A VS Code extension that visualizes how files connect, then lets you ask questions about your project in plain English — answered by an AI that has read your code.

## What it does

Drop into an unfamiliar codebase. Click **Scan workspace** and you instantly see how every file relates to every other file as an interactive dependency graph. Click any file to open it.

Then switch to the **Ask** tab and ask anything:

- *"What does this project do?"*
- *"Where is authentication handled?"*
- *"How does the frontend talk to the backend?"*
- *"What's `client.ts` for?"*

The AI finds the relevant files in your project and answers with concrete references — no more guessing or grepping.

## Features

- **Interactive dependency graph** — every file as a node, every import as an edge. Force-directed layout. Click to open.
- **Codebase-aware Q&A** — ask in plain English, get answers grounded in your actual code with cited source files.
- **Streaming responses** — answers appear word-by-word as they're generated.
- **Multi-turn conversations** — follow up with "explain that more" and the model knows what you mean.
- **Bring your own key** — works with Groq's free tier. Your API key lives in your OS keychain. No backend, no telemetry, no analytics.
- **Multiple languages** — TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, C/C++, C#, Ruby, PHP, Swift, and more.

## Getting started

1. Install Repo Why from the VS Code Marketplace.
2. Get a free Groq API key at [console.groq.com/keys](https://console.groq.com/keys).
3. Click the Repo Why icon in the activity bar, open the **Settings** tab, paste your key, click **Save**.
4. Open any project folder.
5. Click **Graph → Scan workspace** to visualize, or **Ask** to chat about your code.

## Privacy

Your code and questions are sent only to the AI provider you configured (Groq by default). The extension has no backend and collects no telemetry. Your API key is stored in VS Code's encrypted SecretStorage (OS keychain on macOS, Credential Manager on Windows, libsecret on Linux) and never written to plaintext settings files.

## How it works

When you scan a workspace:

1. Repo Why finds every source file in your project, skipping `node_modules`, build outputs, and similar generated folders.
2. It parses each file's imports to build a dependency graph.
3. The graph renders as an interactive force-directed visualization.

When you ask a question:

1. Repo Why scores each file by how relevant it is to your question (keyword overlap on file paths and contents).
2. It picks the top files, packs them into a prompt with your question and recent chat history.
3. It streams the answer back token-by-token.

## Roadmap

- **Git "why" layer** — select any code, ask "why does this exist?", get an AI-synthesized answer based on the original PR, commit messages, and contributors.
- **Local-only mode via Ollama** — zero data leaves your machine.
- **Tree-sitter parsing** for more accurate, function-level retrieval.
- **More provider support** — Anthropic Claude, OpenAI, Google Gemini.

## Development

```bash
git clone https://github.com/bekiTil/repo-why
cd repo-why
npm install
npm run compile
```

Press F5 in VS Code to launch the Extension Development Host with the extension loaded.

## License

MIT — free to use, modify, and distribute.

## Issues & feedback

Open an issue at [github.com/bekiTil/repo-why/issues](https://github.com/bekiTil/repo-why/issues).

---

Built for developers who would rather understand a codebase than memorize it.