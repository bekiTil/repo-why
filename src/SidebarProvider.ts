import * as vscode from 'vscode';
import { scanWorkspace } from './scanner';
import { buildGraph } from './graph';
import { callGroq, callGroqStream } from './llm';
import { retrieveRelevantFiles } from './retrieval';
import { buildQaMessages } from './prompt';
import { SIDEBAR_STYLES } from './webview/sidebarStyles';
import { SIDEBAR_SCRIPT } from './webview/sidebarScript';

const SECRET_KEY_GROQ = 'repoWhy.groqApiKey';

export class SidebarProvider implements vscode.WebviewViewProvider {
  // Must match the view id in package.json: views.repoWhy[0].id
  public static readonly viewType = 'repoWhy.sidebar';

  constructor(private readonly context: vscode.ExtensionContext) {}

  private get extensionUri() {
    return this.context.extensionUri;
  }

  private get secrets() {
    return this.context.secrets;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'scan':
          await this.handleScan(webviewView);
          break;
        case 'openFile':
          await this.handleOpenFile(message);
          break;
        case 'openSourcePath':
          await this.handleOpenSourcePath(message);
          break;
        case 'saveApiKey':
          await this.handleSaveApiKey(webviewView, message);
          break;
        case 'clearApiKey':
          await this.handleClearApiKey(webviewView);
          break;
        case 'loadApiKey':
          await this.handleLoadApiKey(webviewView);
          break;
        case 'testAi':
          await this.handleTestAi(webviewView);
          break;
        case 'ask':
          await this.handleAsk(webviewView, message);
          break;
        default:
          console.warn('Unknown message type from webview:', message.type);
      }
    });
  }

  // ----- Handlers -----

  private async handleScan(webviewView: vscode.WebviewView) {
    try {
      const files = await scanWorkspace();
      const folders = vscode.workspace.workspaceFolders!;
      const root = folders[0].uri.fsPath;
      const graph = await buildGraph(files, root);
      webviewView.webview.postMessage({ type: 'graph', graph });
    } catch (err: any) {
      webviewView.webview.postMessage({
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
    const abs = vscode.Uri.file(root + '/' + message.relativePath);
    try {
      await vscode.window.showTextDocument(abs, { preview: false });
    } catch (err) {
      console.error('Failed to open source path', err);
    }
  }

  private async handleSaveApiKey(webviewView: vscode.WebviewView, message: any) {
    if (typeof message.key !== 'string' || message.key.length === 0) return;
    await this.secrets.store(SECRET_KEY_GROQ, message.key);
    webviewView.webview.postMessage({
      type: 'apiKeyStatus',
      isSet: true,
      masked: maskKey(message.key),
    });
  }

  private async handleClearApiKey(webviewView: vscode.WebviewView) {
    await this.secrets.delete(SECRET_KEY_GROQ);
    webviewView.webview.postMessage({
      type: 'apiKeyStatus',
      isSet: false,
      masked: null,
    });
  }

  private async handleLoadApiKey(webviewView: vscode.WebviewView) {
    const key = await this.secrets.get(SECRET_KEY_GROQ);
    webviewView.webview.postMessage({
      type: 'apiKeyStatus',
      isSet: !!key,
      masked: key ? maskKey(key) : null,
    });
  }

  private async handleTestAi(webviewView: vscode.WebviewView) {
    try {
      const apiKey = await this.secrets.get(SECRET_KEY_GROQ);
      if (!apiKey) {
        webviewView.webview.postMessage({
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
      webviewView.webview.postMessage({
        type: 'testAiResult',
        ok: true,
        text: reply,
      });
    } catch (err: any) {
      webviewView.webview.postMessage({
        type: 'testAiResult',
        ok: false,
        text: err?.message ?? String(err),
      });
    }
  }

  private async handleAsk(webviewView: vscode.WebviewView, message: any) {
  const question: string = message.question;
  if (typeof question !== 'string' || question.trim().length === 0) {
    webviewView.webview.postMessage({
      type: 'askError',
      text: 'Enter a question first.',
    });
    return;
  }

  try {
    const apiKey = await this.secrets.get(SECRET_KEY_GROQ);
    if (!apiKey) {
      webviewView.webview.postMessage({
        type: 'askError',
        text: 'No API key set. Save one in Settings first.',
      });
      return;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      webviewView.webview.postMessage({
        type: 'askError',
        text: 'No folder open. Open a project first.',
      });
      return;
    }

    webviewView.webview.postMessage({ type: 'askProgress', text: 'Scanning files...' });
    const files = await scanWorkspace();

    webviewView.webview.postMessage({
      type: 'askProgress',
      text: `Picking relevant files from ${files.length}...`,
    });
    const relevant = await retrieveRelevantFiles({ question, files });

    webviewView.webview.postMessage({
      type: 'askProgress',
      text: `Asking AI (${relevant.length} files in context)...`,
    });

    const history = Array.isArray(message.history) ? message.history : [];
    const messages = buildQaMessages(question, relevant, history);

    // Begin streaming. Webview should display an empty assistant bubble.
    webviewView.webview.postMessage({ type: 'askStreamStart' });

    await callGroqStream({ apiKey, messages }, (token) => {
      webviewView.webview.postMessage({ type: 'askStreamToken', token });
    });

    // Stream complete. Send sources to attach to the bubble.
    webviewView.webview.postMessage({
      type: 'askStreamEnd',
      sources: relevant.map((r) => r.relativePath),
    });
  } catch (err: any) {
    webviewView.webview.postMessage({
      type: 'askError',
      text: err?.message ?? String(err),
    });
  }
}

  // ----- HTML -----

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
      <button class="tab" data-tab="settings">Settings</button>
    </div>

    <!-- Graph tab -->
    <div class="panel active" id="panel-graph">
      <div class="toolbar">
        <h1>Repo Why</h1>
        <button id="scanBtn">Scan workspace</button>
        <div id="status"></div>
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
    <textarea
      id="questionInput"
      rows="1"
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