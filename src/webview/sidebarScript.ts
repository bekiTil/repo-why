/**
 * All JavaScript that runs inside the sidebar webview.
 * This code runs in the webview's isolated context, NOT the extension host.
 * It cannot import from other modules — it's a self-contained string.
 */
export const SIDEBAR_SCRIPT = `
  const vscode = acquireVsCodeApi();
  const statusEl = document.getElementById('status');
  const containerEl = document.getElementById('graphContainer');
  const settingsStatusEl = document.getElementById('settingsStatus');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const keyStatus = document.getElementById('keyStatus');
  const keyMasked = document.getElementById('keyMasked');
  const testAiBtn = document.getElementById('testAiBtn');
  const testAiResult = document.getElementById('testAiResult');
  const askBtn = document.getElementById('askBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const questionInput = document.getElementById('questionInput');
  const askProgress = document.getElementById('askProgress');
  const chatHistory = document.getElementById('chatHistory');

  let network = null;
  let currentGraph = null;

  // In-memory chat conversation: array of { role, content, sources? }
  let conversation = [];

  // ----- Tab switching -----
  document.querySelectorAll('.tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const target = tabBtn.dataset.tab;
      document.querySelectorAll('.tab').forEach((b) => {
        b.classList.toggle('active', b === tabBtn);
      });
      document.querySelectorAll('.panel').forEach((p) => {
        p.classList.toggle('active', p.id === 'panel-' + target);
      });
    });
  });

  // ----- Scan / graph -----
  document.getElementById('scanBtn').addEventListener('click', () => {
    statusEl.textContent = 'Scanning...';
    if (network) {
      network.destroy();
      network = null;
    }
    vscode.postMessage({ type: 'scan' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'graph':
        renderGraph(message.graph);
        break;
      case 'scanError':
        statusEl.textContent = 'Error: ' + message.text;
        break;
      case 'apiKeyStatus':
        updateKeyStatus(message.isSet, message.masked);
        break;
      case 'testAiResult':
        testAiBtn.disabled = false;
        testAiResult.style.display = 'block';
        testAiResult.textContent = (message.ok ? '✓ ' : '✗ ') + message.text;
        testAiResult.style.color = message.ok
          ? 'var(--vscode-testing-iconPassed, #2d7a3d)'
          : 'var(--vscode-errorForeground, #ff6464)';
        break;
      case 'askProgress':
        askProgress.textContent = message.text;
        break;
      case 'askStreamStart':
        askProgress.textContent = '';
        conversation.push({
            role: 'assistant',
            content: '',
            sources: [],
            streaming: true,
        });
        renderChat();
        break;
      case 'askStreamToken':
        if (conversation.length > 0) {
            const last = conversation[conversation.length - 1];
            if (last.role === 'assistant') {
            last.content += message.token;
            updateLastAssistantBubble(last.content);
            }
        }
        break;
      case 'askStreamEnd':
        askBtn.disabled = false;
        if (conversation.length > 0) {
            const last = conversation[conversation.length - 1];
            if (last.role === 'assistant') {
            last.streaming = false;
            last.sources = message.sources || [];
            }
        }
        renderChat();
        break;
      case 'askError':
        askBtn.disabled = false;
        askProgress.textContent = '';
        // If we have an in-progress assistant bubble, replace it with the error.
        if (conversation.length > 0 && conversation[conversation.length - 1].role === 'assistant') {
            conversation.pop();
        }
        conversation.push({
            role: 'assistant',
            content: '**Error:** ' + message.text,
            sources: [],
        });
        renderChat();
        break;
      case 'askResult':
        askBtn.disabled = false;
        askProgress.textContent = '';
        if (message.ok) {
          conversation.push({
            role: 'assistant',
            content: message.text,
            sources: message.sources || [],
          });
        } else {
          conversation.push({
            role: 'assistant',
            content: '**Error:** ' + message.text,
            sources: [],
          });
        }
        renderChat();
        break;
    }
  });

  function renderGraph(graph) {
    currentGraph = graph;
    statusEl.textContent =
      graph.nodes.length + ' files, ' + graph.edges.length + ' dependencies';

    const visNodes = graph.nodes.map((n) => ({
      id: n.id,
      label: basename(n.id),
      title: n.id,
    }));

    const visEdges = graph.edges.map((e) => ({
      from: e.from,
      to: e.to,
      arrows: 'to',
    }));

    const data = { nodes: visNodes, edges: visEdges };

    const options = {
      nodes: {
        shape: 'dot',
        size: 12,
        font: { color: '#ccc', size: 12 },
      },
      edges: {
        color: { color: '#888', opacity: 0.6 },
        smooth: { type: 'continuous' },
        arrows: { to: { scaleFactor: 0.5 } },
      },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -50,
          springLength: 100,
          springConstant: 0.08,
        },
        solver: 'forceAtlas2Based',
        stabilization: { iterations: 200 },
      },
      interaction: { hover: true, tooltipDelay: 100 },
    };

    network = new vis.Network(containerEl, data, options);

    network.on('click', (params) => {
      if (params.nodes.length === 0) return;
      const nodeId = params.nodes[0];
      const node = currentGraph.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      vscode.postMessage({
        type: 'openFile',
        absolutePath: node.absolutePath,
      });
    });
  }

  function basename(p) {
    return p.split('/').pop();
  }

  // ----- Settings: save / clear key -----
  document.getElementById('saveKeyBtn').addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      settingsStatusEl.textContent = 'Enter a key first.';
      return;
    }
    vscode.postMessage({ type: 'saveApiKey', key });
    apiKeyInput.value = '';
    settingsStatusEl.textContent = 'Saved.';
    setTimeout(() => { settingsStatusEl.textContent = ''; }, 2000);
  });

  document.getElementById('clearKeyBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'clearApiKey' });
    settingsStatusEl.textContent = 'Cleared.';
    setTimeout(() => { settingsStatusEl.textContent = ''; }, 2000);
  });

  function updateKeyStatus(isSet, masked) {
    const badge = keyStatus.querySelector('.badge');
    if (isSet) {
      badge.className = 'badge set';
      badge.textContent = 'Key set';
      keyMasked.textContent = masked || '';
    } else {
      badge.className = 'badge unset';
      badge.textContent = 'No key set';
      keyMasked.textContent = '';
    }
  }

  // ----- Settings: Test AI -----
  testAiBtn.addEventListener('click', () => {
    testAiResult.style.display = 'block';
    testAiResult.textContent = 'Calling Groq...';
    testAiResult.style.color = 'var(--vscode-descriptionForeground)';
    testAiBtn.disabled = true;
    vscode.postMessage({ type: 'testAi' });
  });

  // ----- Ask (chat) -----
  function renderChat() {
    if (conversation.length === 0) {
      chatHistory.innerHTML =
        '<div class="chat-empty">Ask anything about this codebase.<br>Tip: Cmd/Ctrl + Enter to send.</div>';
      return;
    }

    chatHistory.innerHTML = conversation.map(function (msg) {
      if (msg.role === 'user') {
        return '<div class="message user">' +
          '<div class="bubble">' + escapeHtml(msg.content) + '</div>' +
          '</div>';
      }
      const body = window.marked
        ? window.marked.parse(msg.content)
        : escapeHtml(msg.content);
      let sourcesHtml = '';
      if (msg.sources && msg.sources.length > 0) {
        sourcesHtml = '<div class="sources">Sources: ' +
          msg.sources.map(function (s) {
            return '<span class="source-pill" data-path="' +
              escapeAttr(s) + '">' + escapeHtml(s) + '</span>';
          }).join('') +
          '</div>';
      }
       const streamingClass = msg.streaming ? ' streaming' : '';
return '<div class="message assistant' + streamingClass + '">' +
        '<div class="bubble">' + body + '</div>' +
        sourcesHtml +
        '</div>';
    }).join('');

    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  askBtn.addEventListener('click', () => {
    const question = questionInput.value.trim();
    if (!question) return;

    conversation.push({ role: 'user', content: question });
    renderChat();
    questionInput.value = '';
    questionInput.style.height = 'auto';
    // Auto-grow the composer textarea
function autoGrow() {
  questionInput.style.height = 'auto';
  questionInput.style.height = Math.min(questionInput.scrollHeight, 200) + 'px';
}
questionInput.addEventListener('input', autoGrow);

    const completed = conversation.slice(0, -1);
    const history = [];
    for (let i = 0; i < completed.length - 1; i += 2) {
      if (completed[i].role === 'user' && completed[i + 1].role === 'assistant') {
        history.push({
          question: completed[i].content,
          answer: completed[i + 1].content,
        });
      }
    }

    askBtn.disabled = true;
    askProgress.textContent = 'Working...';

    vscode.postMessage({ type: 'ask', question, history });
  });

  clearChatBtn.addEventListener('click', () => {
    conversation = [];
    renderChat();
  });

  questionInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      askBtn.click();
    }
  });
  // Auto-grow the textarea as the user types.
const autoGrow = () => {
  questionInput.style.height = 'auto';
  questionInput.style.height = Math.min(questionInput.scrollHeight, 200) + 'px';
};
questionInput.addEventListener('input', autoGrow);

// Reset height after sending (clearing).
const originalAskClick = askBtn.onclick;
// We already attached the click via addEventListener — also reset height on send.
const observer = new MutationObserver(() => {
  if (questionInput.value === '') autoGrow();
});
observer.observe(questionInput, { attributes: true, attributeFilter: ['value'] });

  chatHistory.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !target.classList || !target.classList.contains('source-pill')) return;
    const path = target.getAttribute('data-path');
    if (!path) return;
    vscode.postMessage({ type: 'openSourcePath', relativePath: path });
  });

  // ----- Helpers -----
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function updateLastAssistantBubble(content) {
    const bubbles = chatHistory.querySelectorAll('.message.assistant .bubble');
    if (bubbles.length === 0) return;
    const lastBubble = bubbles[bubbles.length - 1];
    lastBubble.innerHTML = window.marked
        ? window.marked.parse(content)
        : escapeHtml(content);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    }

  // Ask the extension for the current key status on first render.
  vscode.postMessage({ type: 'loadApiKey' });
`;