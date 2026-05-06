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
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
  const historyStatus = document.getElementById('historyStatus');
  const commitList = document.getElementById('commitList');
  const selectionContent = document.getElementById('selectionContent');
  const graphSearch = document.getElementById('graphSearch');

  const openInEditorBtn = document.getElementById('openInEditorBtn');
  if (openInEditorBtn) {
    openInEditorBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'openInEditor' });
    });
  }

  let network = null;
  let currentGraph = null;
  let conversation = [];

  // ----- Graph color/sizing helpers -----
  const COLOR_PALETTE = [
    '#3794ff', '#9d65ff', '#ff6b9d', '#ffa14a', '#4ade80',
    '#06b6d4', '#f59e0b', '#a78bfa', '#fb7185', '#34d399',
    '#60a5fa', '#f472b6'
  ];
  const dirColorMap = new Map();
  let colorIndex = 0;

  function topLevelDir(path) {
    const parts = path.split('/');
    return parts.length > 1 ? parts[0] : '(root)';
  }

  function getDirColor(dir) {
    if (!dirColorMap.has(dir)) {
      dirColorMap.set(dir, COLOR_PALETTE[colorIndex % COLOR_PALETTE.length]);
      colorIndex++;
    }
    return dirColorMap.get(dir);
  }

  // ----- Right-click context menu (created once, reused) -----
  const graphContextMenu = document.createElement('div');
  graphContextMenu.className = 'graph-context-menu';
  graphContextMenu.style.display = 'none';
  graphContextMenu.innerHTML =
    '<div class="context-header" id="graphContextHeader">File</div>' +
    '<div class="context-item" data-action="open">Open file</div>' +
    '<div class="context-item" data-action="ask">Ask AI about this file</div>' +
    '<div class="context-item" data-action="highlight">Highlight neighbors</div>' +
    '<div class="context-divider"></div>' +
    '<div class="context-item" data-action="reset">Reset view</div>';
  document.body.appendChild(graphContextMenu);

  let contextMenuNodeId = null;

  graphContextMenu.addEventListener('click', function (e) {
    const action = e.target && e.target.dataset && e.target.dataset.action;
    graphContextMenu.style.display = 'none';
    if (!action || !contextMenuNodeId || !currentGraph) return;

    const node = currentGraph.nodes.find(function (n) { return n.id === contextMenuNodeId; });
    if (!node) return;

    switch (action) {
      case 'open':
        vscode.postMessage({ type: 'openFile', absolutePath: node.absolutePath });
        break;
      case 'ask':
        vscode.postMessage({
          type: 'askAboutFile',
          relativePath: node.id,
          absolutePath: node.absolutePath,
        });
        break;
      case 'highlight':
        applyHighlight(contextMenuNodeId);
        break;
      case 'reset':
        clearHighlight();
        if (graphSearch) graphSearch.value = '';
        break;
    }
  });

  document.addEventListener('click', function () {
    graphContextMenu.style.display = 'none';
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') graphContextMenu.style.display = 'none';
  });

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
      if (target === 'history' && !window.__historyLoaded) {
        window.__historyLoaded = true;
        loadHistory();
      }
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
      case 'switchToAsk':
        document.querySelectorAll('.tab').forEach((b) => {
          b.classList.toggle('active', b.dataset.tab === 'ask');
        });
        document.querySelectorAll('.panel').forEach((p) => {
          p.classList.toggle('active', p.id === 'panel-ask');
        });
        break;
      case 'pushUserMessage':
        conversation.push({ role: 'user', content: message.content });
        renderChat();
        break;
      case 'historyResult':
        if (message.ok) {
          renderCommits(message.commits);
        } else {
          historyStatus.textContent = message.text;
          commitList.innerHTML = '';
        }
        break;
      case 'selectionBlame':
        renderSelectionBlame(message);
        break;
    }
  });

  // ----- Graph rendering -----
  function renderGraph(graph) {
    currentGraph = graph;
    statusEl.textContent =
      graph.nodes.length + ' files, ' + graph.edges.length + ' dependencies';

    const incomingCount = new Map();
    graph.edges.forEach(function (e) {
      incomingCount.set(e.to, (incomingCount.get(e.to) || 0) + 1);
    });

    const visNodes = graph.nodes.map(function (n) {
      const incoming = incomingCount.get(n.id) || 0;
      const size = 8 + Math.min(incoming * 3, 28);
      const dir = topLevelDir(n.id);
      const color = getDirColor(dir);

      return {
        id: n.id,
        label: basename(n.id),
        title: n.id + ' (' + incoming + ' file' + (incoming === 1 ? '' : 's') + ' import this)',
        size: size,
        color: { background: color, border: color },
        font: { color: '#ccc', size: 12 },
      };
    });

    const visEdges = graph.edges.map(function (e, i) {
      return {
        id: 'edge_' + i,
        from: e.from,
        to: e.to,
        arrows: 'to',
      };
    });

    const data = { nodes: visNodes, edges: visEdges };

    const options = {
      nodes: { shape: 'dot', borderWidth: 2 },
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

    network.on('click', function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = currentGraph.nodes.find(function (n) { return n.id === nodeId; });
        if (node) {
          vscode.postMessage({
            type: 'openFile',
            absolutePath: node.absolutePath,
          });
        }
        applyHighlight(nodeId);
      } else {
        clearHighlight();
      }
    });

    network.on('oncontext', function (params) {
      params.event.preventDefault();
      const nodeId = network.getNodeAt(params.pointer.DOM);
      if (!nodeId) {
        graphContextMenu.style.display = 'none';
        return;
      }
      contextMenuNodeId = nodeId;
      const headerEl = document.getElementById('graphContextHeader');
      if (headerEl) headerEl.textContent = basename(nodeId);
      graphContextMenu.style.left = params.event.clientX + 'px';
      graphContextMenu.style.top = params.event.clientY + 'px';
      graphContextMenu.style.display = 'block';
    });
  }

  function applyHighlight(nodeId) {
    if (!network || !currentGraph) return;

    const connected = new Set([nodeId]);
    currentGraph.edges.forEach(function (e) {
      if (e.from === nodeId) connected.add(e.to);
      if (e.to === nodeId) connected.add(e.from);
    });

    const nodeUpdates = currentGraph.nodes.map(function (n) {
      const isConnected = connected.has(n.id);
      const dir = topLevelDir(n.id);
      const baseColor = getDirColor(dir);

      if (isConnected) {
        return {
          id: n.id,
          color: {
            background: baseColor,
            border: n.id === nodeId ? '#ffffff' : baseColor,
          },
          borderWidth: n.id === nodeId ? 4 : 2,
          font: { color: '#fff' },
        };
      }
      return {
        id: n.id,
        color: { background: '#2a2a2a', border: '#2a2a2a' },
        borderWidth: 2,
        font: { color: '#555' },
      };
    });

    const edgeUpdates = currentGraph.edges.map(function (e, i) {
      const isConnected = (e.from === nodeId || e.to === nodeId);
      return {
        id: 'edge_' + i,
        color: {
          color: isConnected ? '#ffffff' : '#1a1a1a',
          opacity: isConnected ? 0.8 : 0.1,
        },
      };
    });

    network.body.data.nodes.update(nodeUpdates);
    network.body.data.edges.update(edgeUpdates);
  }

  function clearHighlight() {
    if (!network || !currentGraph) return;

    const nodeUpdates = currentGraph.nodes.map(function (n) {
      const dir = topLevelDir(n.id);
      const baseColor = getDirColor(dir);
      return {
        id: n.id,
        color: { background: baseColor, border: baseColor },
        borderWidth: 2,
        font: { color: '#ccc' },
      };
    });

    const edgeUpdates = currentGraph.edges.map(function (e, i) {
      return {
        id: 'edge_' + i,
        color: { color: '#888', opacity: 0.6 },
      };
    });

    network.body.data.nodes.update(nodeUpdates);
    network.body.data.edges.update(edgeUpdates);
  }

  function applySearchHighlight(matchingIds) {
    if (!network || !currentGraph) return;

    const matchSet = new Set(matchingIds);

    const nodeUpdates = currentGraph.nodes.map(function (n) {
      const dir = topLevelDir(n.id);
      const baseColor = getDirColor(dir);
      const isMatch = matchSet.has(n.id);

      if (isMatch) {
        return {
          id: n.id,
          color: { background: baseColor, border: '#ffeb3b' },
          borderWidth: 3,
          font: { color: '#fff' },
        };
      }
      return {
        id: n.id,
        color: { background: '#2a2a2a', border: '#2a2a2a' },
        borderWidth: 2,
        font: { color: '#444' },
      };
    });

    const edgeUpdates = currentGraph.edges.map(function (e, i) {
      return {
        id: 'edge_' + i,
        color: { color: '#1a1a1a', opacity: 0.15 },
      };
    });

    network.body.data.nodes.update(nodeUpdates);
    network.body.data.edges.update(edgeUpdates);
  }

  function basename(p) {
    return p.split('/').pop();
  }

  // ----- Selection blame -----
  function renderSelectionBlame(msg) {
    if (!msg.ok) {
      let text;
      switch (msg.reason) {
        case 'no-editor': text = 'No file open.'; break;
        case 'no-selection': text = 'Select code in the editor to see who last changed it.'; break;
        case 'no-folder': text = 'No folder open.'; break;
        case 'not-git': text = 'This folder is not a git repository.'; break;
        case 'outside-workspace': text = 'The active file is outside the workspace.'; break;
        default: text = 'Error: ' + (msg.text || 'unknown');
      }
      selectionContent.className = 'selection-empty';
      selectionContent.innerHTML = escapeHtml(text);
      return;
    }

    selectionContent.className = '';
    const lineRange = msg.startLine === msg.endLine
      ? 'L' + msg.startLine
      : 'L' + msg.startLine + '–' + msg.endLine;

    const commitsHtml = (msg.commits || []).map(function (c) {
      return '<div class="commit">' +
        '<div class="commit-subject">' + escapeHtml(c.subject) + '</div>' +
        '<div class="commit-meta">' +
          '<span class="commit-hash">' + c.shortHash + '</span>' +
          '<span class="commit-author">' + escapeHtml(c.author) + '</span>' +
          '<span>' + relativeTime(c.date) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    selectionContent.innerHTML =
      '<div class="selection-info">' +
        '<span class="file-path">' + escapeHtml(msg.filePath) + '</span>' +
        '<span class="line-range">' + lineRange + '</span>' +
      '</div>' +
      (commitsHtml || '<div class="selection-empty">No blame info found for this range.</div>');
  }

  // ----- History -----
  function loadHistory() {
    historyStatus.textContent = 'Loading commits...';
    commitList.innerHTML = '';
    vscode.postMessage({ type: 'loadHistory' });
  }

  function renderCommits(commits) {
    if (!commits || commits.length === 0) {
      historyStatus.textContent = '';
      commitList.innerHTML = '<div class="commit-empty">No commits in this repo.</div>';
      return;
    }
    historyStatus.textContent = commits.length + ' commits loaded';
    commitList.innerHTML = commits.map(function (c) {
      return '<div class="commit">' +
        '<div class="commit-subject">' + escapeHtml(c.subject) + '</div>' +
        '<div class="commit-meta">' +
          '<span class="commit-hash">' + c.shortHash + '</span>' +
          '<span class="commit-author">' + escapeHtml(c.author) + '</span>' +
          '<span>' + relativeTime(c.date) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function relativeTime(isoDate) {
    const now = new Date();
    const then = new Date(isoDate);
    const diffMs = now.getTime() - then.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return diffDays + ' days ago';
    if (diffDays < 30) return Math.floor(diffDays / 7) + ' weeks ago';
    if (diffDays < 365) return Math.floor(diffDays / 30) + ' months ago';
    return Math.floor(diffDays / 365) + ' years ago';
  }

  refreshHistoryBtn.addEventListener('click', loadHistory);

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
        const body = window.marked
          ? window.marked.parse(msg.content)
          : escapeHtml(msg.content);
        return '<div class="message user">' +
          '<div class="bubble">' + body + '</div>' +
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

  function autoGrow() {
    questionInput.style.height = 'auto';
    questionInput.style.height = Math.min(questionInput.scrollHeight, 200) + 'px';
  }
  questionInput.addEventListener('input', autoGrow);

  chatHistory.addEventListener('click', (e) => {
    const target = e.target;
    if (!target || !target.classList || !target.classList.contains('source-pill')) return;
    const path = target.getAttribute('data-path');
    if (!path) return;
    vscode.postMessage({ type: 'openSourcePath', relativePath: path });
  });

  // ----- Graph search -----
  if (graphSearch) {
    graphSearch.addEventListener('input', function (e) {
      const query = e.target.value.trim().toLowerCase();
      if (!query) {
        clearHighlight();
        return;
      }
      if (!currentGraph) return;
      const matching = currentGraph.nodes.filter(function (n) {
        return n.id.toLowerCase().includes(query);
      });
      applySearchHighlight(matching.map(function (n) { return n.id; }));
    });

    graphSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && network && currentGraph) {
        const query = graphSearch.value.trim().toLowerCase();
        if (!query) return;
        const matching = currentGraph.nodes.filter(function (n) {
          return n.id.toLowerCase().includes(query);
        });
        if (matching.length > 0) {
          network.focus(matching[0].id, {
            scale: 1.5,
            animation: { duration: 500, easingFunction: 'easeInOutQuad' },
          });
        }
      } else if (e.key === 'Escape') {
        graphSearch.value = '';
        clearHighlight();
        graphSearch.blur();
      }
    });
  }

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

  vscode.postMessage({ type: 'loadApiKey' });
`;