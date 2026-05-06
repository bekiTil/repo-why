import * as vscode from 'vscode';
import * as path from 'path';
import { scanWorkspace } from './scanner';
import { buildGraph } from './graph';
import { callGroq, callGroqStream } from './llm';
import { retrieveRelevantFiles } from './retrieval';
import { buildQaMessages, buildWhyMessages } from './prompt';
import {
  isGitRepo,
  getRecentCommits,
  getBlameForRange,
  getCommitDiff,
} from './git';
import { SIDEBAR_STYLES } from './webview/sidebarStyles';
import { SIDEBAR_SCRIPT } from './webview/sidebarScript';

const SECRET_KEY_GROQ = 'repoWhy.groqApiKey';

export class SidebarProvider implements vscode.WebviewViewProvider {
  // Must match the view id in package.json: views.repoWhy[0].id
  public static readonly viewType = 'repoWhy.sidebar';

  // The latest sidebar webview view (replaced when sidebar reopens).
  private webviewView?: vscode.WebviewView;

  // All open editor-tab webview panels.
  private editorPanels: Set<vscode.WebviewPanel> = new Set();

  // Debounce timer for editor selection blame updates.
  private selectionDebounce: NodeJS.Timeout | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private get extensionUri() {
    return this.context.extensionUri;
  }

  private get secrets() {
    return this.context.secrets;
  }

  // ============================================================
  // WebviewViewProvider entry — called when sidebar is opened
  // ============================================================

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    this.setupWebview(webviewView.webview);

    // Editor selection → blame (debounced). Only set up once per provider
    // lifecycle; events naturally route to all webviews via postToAll.
    const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(() => {
      if (this.selectionDebounce) clearTimeout(this.selectionDebounce);
      this.selectionDebounce = setTimeout(() => this.handleSelectionChanged(), 500);
    });
    this.context.subscriptions.push(selectionDisposable);

    const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
      if (this.selectionDebounce) clearTimeout(this.selectionDebounce);
      this.selectionDebounce = setTimeout(() => this.handleSelectionChanged(), 200);
    });
    this.context.subscriptions.push(activeEditorDisposable);
  }

  // ============================================================
  // Public API used by extension.ts commands
  // ============================================================

  /** Open the same UI in a wide editor tab (like GitHub Copilot Chat). */
  public openInEditor(): void {
    const panel = vscode.window.createWebviewPanel(
      'repoWhy.editor',
      'Repo Why',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [this.extensionUri],
        retainContextWhenHidden: true,
      }
    );

    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.svg');
    this.editorPanels.add(panel);
    this.setupWebview(panel.webview);

    panel.onDidDispose(() => {
      this.editorPanels.delete(panel);
    });
  }

  /** Right-click "Repo Why: Why does this exist?" */
  public async askWhyForSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Open a file and select some code first.');
      return;
    }
    if (editor.selection.isEmpty) {
      vscode.window.showWarningMessage('Select some code first.');
      return;
    }

    await vscode.commands.executeCommand('repoWhy.sidebar.focus');
    await new Promise((r) => setTimeout(r, 100));

    if (!this.webviewView) {
      vscode.window.showErrorMessage('Repo Why sidebar could not open.');
      return;
    }

    this.webviewView.show?.(true);
    await this.runWhyQuery(editor);
  }

  // ============================================================
  // Webview setup (shared between sidebar and editor tab)
  // ============================================================

  private setupWebview(webview: vscode.Webview): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webview.html = this.getHtml();

    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'scan':
          await this.handleScan(webview);
          break;
        case 'openFile':
          await this.handleOpenFile(message);
          break;
        case 'openSourcePath':
          await this.handleOpenSourcePath(message);
          break;
        case 'saveApiKey':
          await this.handleSaveApiKey(webview, message);
          break;
        case 'clearApiKey':
          await this.handleClearApiKey(webview);
          break;
        case 'loadApiKey':
          await this.handleLoadApiKey(webview);
          break;
        case 'testAi':
          await this.handleTestAi(webview);
          break;
        case 'ask':
          await this.handleAsk(webview, message);
          break;
        case 'loadHistory':
          await this.handleLoadHistory(webview);
          break;
        case 'askAboutFile':
          await this.handleAskAboutFile(webview, message);
          break;
        case 'openInEditor':
          this.openInEditor();
          break;
        default:
          console.warn('Unknown message type from webview:', message.type);
      }
    });
  }

  /** Post a message to the sidebar AND every open editor tab. */
  private postToAllWebviews(message: any): void {
    if (this.webviewView) {
      try { this.webviewView.webview.postMessage(message); } catch {}
    }
    this.editorPanels.forEach((p) => {
      try { p.webview.postMessage(message); } catch {}
    });
  }

  // ============================================================
  // Handlers — Graph
  // ============================================================

  private async handleScan(webview: vscode.Webview) {
    try {
      const files = await scanWorkspace();
      const folders = vscode.workspace.workspaceFolders!;
      const root = folders[0].uri.fsPath;
      const graph = await buildGraph(files, root);
      webview.postMessage({ type: 'graph', graph });
    } catch (err: any) {
      webview.postMessage({
        type: 'scanError',
        text: err?.message ?? String(err),
      });
    }
  }

  private async handleOpenFile(message: any) {
    if (typeof message.absolutePath !== 'string') return;
    try {
      const uri = vscode.Uri.file(message.absolutePath);
      await vscode.window.showTextDocument(uri, { preview: false });
    } catch (err: any) {
      console.error('Failed to open file', message.absolutePath, err);
    }
  }

  private async handleOpenSourcePath(message: any) {
    if (typeof message.relativePath !== 'string') return;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    const root = folders[0].uri.fsPath;
    const abs = vscode.Uri.file(path.join(root, message.relativePath));
    try {
      await vscode.window.showTextDocument(abs, { preview: false });
    } catch (err) {
      console.error('Failed to open source path', err);
    }
  }

  // ============================================================
  // Handlers — Settings / API key
  // ============================================================

  private async handleSaveApiKey(webview: vscode.Webview, message: any) {
    if (typeof message.key !== 'string' || message.key.length === 0) return;
    await this.secrets.store(SECRET_KEY_GROQ, message.key);
    webview.postMessage({
      type: 'apiKeyStatus',
      isSet: true,
      masked: maskKey(message.key),
    });
  }

  private async handleClearApiKey(webview: vscode.Webview) {
    await this.secrets.delete(SECRET_KEY_GROQ);
    webview.postMessage({
      type: 'apiKeyStatus',
      isSet: false,
      masked: null,
    });
  }

  private async handleLoadApiKey(webview: vscode.Webview) {
    const key = await this.secrets.get(SECRET_KEY_GROQ);
    webview.postMessage({
      type: 'apiKeyStatus',
      isSet: !!key,
      masked: key ? maskKey(key) : null,
    });
  }

  private async handleTestAi(webview: vscode.Webview) {
    try {
      const apiKey = await this.secrets.get(SECRET_KEY_GROQ);
      if (!apiKey) {
        webview.postMessage({
          type: 'testAiResult',
          ok: false,
          text: 'No API key set. Save one in Settings first.',
        });
        return;
      }
      const reply = await callGroq({
        apiKey,
        messages: [{ role: 'user', content: 'Say hello in 5 words. Be playful.' }],
      });
      webview.postMessage({
        type: 'testAiResult',
        ok: true,
        text: reply,
      });
    } catch (err: any) {
      webview.postMessage({
        type: 'testAiResult',
        ok: false,
        text: err?.message ?? String(err),
      });
    }
  }

  // ============================================================
  // Handlers — Ask (chat with streaming)
  // ============================================================

  private async handleAsk(webview: vscode.Webview, message: any) {
    const question: string = message.question;
    if (typeof question !== 'string' || question.trim().length === 0) {
      webview.postMessage({
        type: 'askError',
        text: 'Enter a question first.',
      });
      return;
    }

    try {
      const apiKey = await this.secrets.get(SECRET_KEY_GROQ);
      if (!apiKey) {
        webview.postMessage({
          type: 'askError',
          text: 'No API key set. Save one in Settings first.',
        });
        return;
      }

      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        webview.postMessage({
          type: 'askError',
          text: 'No folder open. Open a project first.',
        });
        return;
      }

      webview.postMessage({ type: 'askProgress', text: 'Scanning files...' });
      const files = await scanWorkspace();

      webview.postMessage({
        type: 'askProgress',
        text: `Picking relevant files from ${files.length}...`,
      });
      const relevant = await retrieveRelevantFiles({ question, files });

      webview.postMessage({
        type: 'askProgress',
        text: `Asking AI (${relevant.length} files in context)...`,
      });

      const history = Array.isArray(message.history) ? message.history : [];
      const messages = buildQaMessages(question, relevant, history);

      webview.postMessage({ type: 'askStreamStart' });

      await callGroqStream({ apiKey, messages }, (token) => {
        webview.postMessage({ type: 'askStreamToken', token });
      });

      webview.postMessage({
        type: 'askStreamEnd',
        sources: relevant.map((r) => r.relativePath),
      });
    } catch (err: any) {
      webview.postMessage({
        type: 'askError',
        text: err?.message ?? String(err),
      });
    }
  }

  /** Right-click in graph → "Ask AI about this file" */
  private async handleAskAboutFile(webview: vscode.Webview, message: any) {
    if (typeof message.relativePath !== 'string') return;

    const question = `What does \`${message.relativePath}\` do? Explain its purpose, what it exports, and how it fits into the overall codebase.`;

    webview.postMessage({ type: 'switchToAsk' });
    webview.postMessage({ type: 'pushUserMessage', content: question });

    await this.handleAsk(webview, { question, history: [] });
  }

  // ============================================================
  // Handlers — History
  // ============================================================

  private async handleLoadHistory(webview: vscode.Webview) {
    try {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        webview.postMessage({
          type: 'historyResult',
          ok: false,
          text: 'No folder open. Open a project first.',
        });
        return;
      }

      const root = folders[0].uri.fsPath;
      const isRepo = await isGitRepo(root);
      if (!isRepo) {
        webview.postMessage({
          type: 'historyResult',
          ok: false,
          text: 'This folder is not a git repository.',
        });
        return;
      }

      const commits = await getRecentCommits(root, 50);
      webview.postMessage({
        type: 'historyResult',
        ok: true,
        commits,
      });
    } catch (err: any) {
      webview.postMessage({
        type: 'historyResult',
        ok: false,
        text: err?.message ?? String(err),
      });
    }
  }

  // ============================================================
  // Selection blame — broadcasts to all open webviews
  // ============================================================

  private async handleSelectionChanged() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.postToAllWebviews({
        type: 'selectionBlame',
        ok: false,
        reason: 'no-editor',
      });
      return;
    }

    const selection = editor.selection;
    const startLine = selection.start.line + 1;
    const endLine = Math.max(startLine, selection.end.line + 1);

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.postToAllWebviews({
        type: 'selectionBlame',
        ok: false,
        reason: 'no-folder',
      });
      return;
    }

    const root = folders[0].uri.fsPath;
    const absolutePath = editor.document.uri.fsPath;

    if (!absolutePath.startsWith(root)) {
      this.postToAllWebviews({
        type: 'selectionBlame',
        ok: false,
        reason: 'outside-workspace',
      });
      return;
    }

    const relativePath = path.relative(root, absolutePath);

    try {
      const isRepo = await isGitRepo(root);
      if (!isRepo) {
        this.postToAllWebviews({
          type: 'selectionBlame',
          ok: false,
          reason: 'not-git',
        });
        return;
      }

      const commits = await getBlameForRange(root, relativePath, startLine, endLine);
      this.postToAllWebviews({
        type: 'selectionBlame',
        ok: true,
        filePath: relativePath,
        startLine,
        endLine,
        commits,
      });
    } catch (err: any) {
      this.postToAllWebviews({
        type: 'selectionBlame',
        ok: false,
        reason: 'error',
        text: err?.message ?? String(err),
      });
    }
  }

  // ============================================================
  // "Why does this exist?" command
  // ============================================================

  private async runWhyQuery(editor: vscode.TextEditor) {
    if (!this.webviewView) return;
    const webview = this.webviewView.webview;

    const selection = editor.selection;
    const selectedCode = editor.document.getText(selection);
    const startLine = selection.start.line + 1;
    const endLine = Math.max(startLine, selection.end.line + 1);

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      webview.postMessage({ type: 'askError', text: 'No folder is open.' });
      return;
    }
    const root = folders[0].uri.fsPath;
    const absolutePath = editor.document.uri.fsPath;
    if (!absolutePath.startsWith(root)) {
      webview.postMessage({
        type: 'askError',
        text: 'Selected file is outside the workspace.',
      });
      return;
    }
    const relativePath = path.relative(root, absolutePath);

    const userQuestion =
      `**Why does this code exist?**\n\n` +
      `From \`${relativePath}\` (lines ${startLine}-${endLine}):\n\n` +
      '```\n' + selectedCode + '\n```';

    webview.postMessage({ type: 'switchToAsk' });
    webview.postMessage({ type: 'pushUserMessage', content: userQuestion });

    try {
      const apiKey = await this.secrets.get(SECRET_KEY_GROQ);
      if (!apiKey) {
        webview.postMessage({
          type: 'askError',
          text: 'No API key set. Save one in Settings first.',
        });
        return;
      }

      const isRepo = await isGitRepo(root);
      if (!isRepo) {
        webview.postMessage({
          type: 'askError',
          text: 'This folder is not a git repository.',
        });
        return;
      }

      webview.postMessage({ type: 'askProgress', text: 'Reading git history...' });
      const commits = await getBlameForRange(root, relativePath, startLine, endLine);

      if (commits.length === 0) {
        webview.postMessage({
          type: 'askError',
          text: 'No git history found for these lines. The code may be uncommitted.',
        });
        return;
      }

      webview.postMessage({
        type: 'askProgress',
        text: `Fetching diffs from ${commits.length} commit${commits.length === 1 ? '' : 's'}...`,
      });
      const commitsWithDiffs = await Promise.all(
        commits.map(async (c) => ({
          commit: c,
          diff: await getCommitDiff(root, c.hash, relativePath),
        })),
      );

      webview.postMessage({ type: 'askProgress', text: 'Analyzing with AI...' });

      const messages = buildWhyMessages({
        filePath: relativePath,
        startLine,
        endLine,
        selectedCode,
        commits: commitsWithDiffs,
      });

      webview.postMessage({ type: 'askStreamStart' });

      await callGroqStream({ apiKey, messages }, (token) => {
        webview.postMessage({ type: 'askStreamToken', token });
      });

      webview.postMessage({
        type: 'askStreamEnd',
        sources: commits.map((c) => `${c.shortHash} — ${c.subject}`),
      });
    } catch (err: any) {
      webview.postMessage({
        type: 'askError',
        text: err?.message ?? String(err),
      });
    }
  }

  // ============================================================
  // HTML
  // ============================================================

  private getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src 'unsafe-inline';
               script-src 'unsafe-inline' https://cdnjs.cloudflare.com;
               img-src https: data:;
               font-src https: data:;">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.9/standalone/umd/vis-network.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
    <style>${SIDEBAR_STYLES}</style>
  </head>
  <body>
    <div class="tabs">
      <button class="tab active" data-tab="graph">Graph</button>
      <button class="tab" data-tab="ask">Ask</button>
      <button class="tab" data-tab="history">History</button>
      <button class="tab" data-tab="settings">Settings</button>
    </div>

    <!-- Graph tab -->
    <div class="panel active" id="panel-graph">
      <div class="toolbar">
        <div class="toolbar-header">
          <h1>Repo Why</h1>
          <button id="openInEditorBtn" class="icon-btn" title="Open in editor tab" aria-label="Open in editor tab">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M9 3h4v4M13 3L7 9M11 9v3.5C11 13 11 13 10.5 13h-7C3 13 3 13 3 12.5v-7C3 5 3 5 3.5 5H7"
                stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="graph-controls">
          <button id="scanBtn">Scan workspace</button>
          <input type="search" id="graphSearch" placeholder="Search files..." />
        </div>
        <div id="status"></div>
        <div class="graph-hint">Right-click a node for actions.</div>
      </div>
      <div id="graphContainer"></div>
    </div>

    <!-- Ask tab -->
    <div class="panel" id="panel-ask">
      <div class="chat-container">
        <div class="chat-history" id="chatHistory">
          <div class="chat-empty">
            Ask anything about this codebase.<br>
            Tip: Cmd/Ctrl + Enter to send.
          </div>
        </div>
        <div class="chat-input-area">
          <div class="composer">
            <textarea id="questionInput" rows="1"
              placeholder="Ask about this codebase..."></textarea>
            <div class="composer-footer">
              <span class="composer-hint">⌘ + ↩ to send</span>
              <div class="composer-actions">
                <button id="clearChatBtn" class="icon-btn" title="Clear chat" aria-label="Clear chat">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 5h10M6 5V3.5C6 3.2 6.2 3 6.5 3h3c.3 0 .5.2.5.5V5M5 5l.5 8c0 .5.5 1 1 1h3c.5 0 1-.5 1-1L11 5"
                      stroke="currentColor" stroke-width="1.2"
                      stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button id="askBtn" class="send-btn" title="Send (⌘+↩)" aria-label="Send">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 12.5V3.5M8 3.5L4 7.5M8 3.5L12 7.5"
                      stroke="currentColor" stroke-width="1.8"
                      stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div id="askProgress"></div>
        </div>
      </div>
    </div>

    <!-- History tab -->
    <div class="panel" id="panel-history">
      <div class="history-content">
        <div class="section-title">Current selection</div>
        <div id="selectionContent" class="selection-empty">
          Select code in the editor to see who last changed it.
        </div>

        <hr class="section-divider" />

        <div class="history-header">
          <div class="section-title">Recent commits</div>
          <button id="refreshHistoryBtn" class="secondary">Refresh</button>
        </div>
        <div id="historyStatus"></div>
        <div id="commitList"></div>
      </div>
    </div>

    <!-- Settings tab -->
    <div class="panel" id="panel-settings">
      <div class="settings-content">
        <h1>Settings</h1>

        <label for="providerSelect">AI provider</label>
        <select id="providerSelect">
          <option value="groq">Groq (free tier)</option>
        </select>

        <label for="apiKeyInput">API key</label>
        <input id="apiKeyInput" type="password" placeholder="gsk_..." />

        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button id="saveKeyBtn">Save key</button>
          <button id="clearKeyBtn" class="secondary">Clear</button>
        </div>

        <div class="key-status" id="keyStatus">
          <span class="badge unset">No key set</span>
          <span id="keyMasked"></span>
        </div>

        <div id="settingsStatus"></div>

        <div class="help">
          Get a free Groq API key at
          <a href="https://console.groq.com/keys">console.groq.com/keys</a>.
          Your key is stored encrypted in your OS keychain and never sent anywhere except Groq.
        </div>

        <hr class="divider" />

        <label>Test the connection</label>
        <button id="testAiBtn">Test AI</button>
        <div id="testAiResult" class="key-status" style="display: none;"></div>
      </div>
    </div>

    <script>${SIDEBAR_SCRIPT}</script>
  </body>
</html>`;
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '...' + key.slice(-4);
}