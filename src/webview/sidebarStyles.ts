/**
 * All CSS for the sidebar webview.
 * Kept in its own file so SidebarProvider stays focused on logic, not styling.
 */
export const SIDEBAR_STYLES = `
  html, body {
    height: 100%;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-foreground);
    font-size: 13px;
    display: flex;
    flex-direction: column;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    flex-shrink: 0;
  }
  .tab {
      flex: 1 1 0;
      min-width: 0;
      padding: 8px 4px;
      cursor: pointer;
      background: transparent;
      color: var(--vscode-foreground);
      border: none;
      font-size: 11px;
      font-weight: 500;
      opacity: 0.7;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      text-align: center;
      text-overflow: ellipsis;
      overflow: hidden;
      transition: opacity 0.15s ease, border-bottom-color 0.15s ease;
  }
  .tab:hover {
    opacity: 0.9;
  }
 .tab.active {
    opacity: 1;
    border-bottom-color: var(--vscode-textLink-foreground, #3794ff);
  }
  .panel {
    display: none;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
  }
  .panel.active {
    display: flex;
  }
  .toolbar {
    padding: 12px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
  }
  h1 {
    font-size: 14px;
    margin: 0 0 8px 0;
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
  }
  button:hover {
    background: var(--vscode-button-hoverBackground);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  button.secondary {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border, #555);
  }
  input, select, textarea {
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    font-family: inherit;
    font-size: 13px;
    box-sizing: border-box;
  }
  textarea {
    resize: vertical;
  }
  label {
    display: block;
    margin-top: 12px;
    margin-bottom: 4px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
  #status, #settingsStatus {
    margin-top: 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
  #graphContainer {
    flex: 1;
    min-height: 400px;
  }
  .settings-content {
    padding: 16px;
    overflow-y: auto;
  }
  .key-status {
    margin-top: 12px;
    padding: 8px;
    background: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    word-break: break-word;
  }
  .key-status .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11px;
    margin-right: 6px;
  }
  .key-status .badge.set {
    background: #2d7a3d;
    color: white;
  }
  .key-status .badge.unset {
    background: #7a2d2d;
    color: white;
  }
  .help {
    margin-top: 12px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .help a {
    color: var(--vscode-textLink-foreground);
  }
  hr.divider {
    margin-top: 16px;
    border: none;
    border-top: 1px solid var(--vscode-panel-border, #333);
  }

  /* ----- Chat (Ask tab) ----- */
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .chat-history {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .chat-empty {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    text-align: center;
    padding: 32px 16px;
    font-style: italic;
  }
  .message {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .message.user {
    align-items: flex-end;
  }
  .message.user .bubble code {
  background: rgba(255, 255, 255, 0.18);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 12px;
  color: var(--vscode-button-foreground);
}
.message.user .bubble pre {
  background: rgba(0, 0, 0, 0.25);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 8px 0;
}
.message.user .bubble pre code {
  background: transparent;
  padding: 0;
  color: var(--vscode-button-foreground);
}
.message.user .bubble p {
  margin: 4px 0;
}
.message.user .bubble p:first-child { margin-top: 0; }
.message.user .bubble p:last-child { margin-bottom: 0; }
  .message .bubble {
    padding: 8px 12px;
    border-radius: 10px;
    max-width: 95%;
    line-height: 1.5;
    font-size: 13px;
    word-wrap: break-word;
  }
  .message.user .bubble {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 10px 10px 2px 10px;
  }
  .message.assistant .bubble {
    background: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
    color: var(--vscode-foreground);
    border-radius: 10px 10px 10px 2px;
  }
  .message.assistant .bubble code {
    background: var(--vscode-textCodeBlock-background, #1a1a1a);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
  }
  .message.assistant .bubble pre {
    background: var(--vscode-textCodeBlock-background, #1a1a1a);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 8px 0;
  }
  .message.assistant .bubble pre code {
    background: transparent;
    padding: 0;
    font-size: 12px;
  }
  .message.assistant .bubble h1,
  .message.assistant .bubble h2,
  .message.assistant .bubble h3 {
    font-size: 14px;
    margin: 12px 0 4px 0;
  }
  .message.assistant .bubble ul,
  .message.assistant .bubble ol {
    padding-left: 20px;
    margin: 6px 0;
  }
  .message.assistant .bubble p {
    margin: 6px 0;
  }
  .message.assistant .bubble p:first-child { margin-top: 0; }
  .message.assistant .bubble p:last-child { margin-bottom: 0; }
  .message.assistant .bubble a {
    color: var(--vscode-textLink-foreground);
  }
.message.assistant.streaming .bubble::after {
  content: '▊';
  display: inline-block;
  margin-left: 2px;
  color: var(--vscode-textLink-foreground, #3794ff);
  animation: blink 1s steps(1) infinite;
  vertical-align: baseline;
}
@keyframes blink {
  50% { opacity: 0; }
}
  .message .sources {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
  }
  .message .source-pill {
    display: inline-block;
    margin: 2px 4px 2px 0;
    padding: 2px 6px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
    cursor: pointer;
    font-size: 11px;
  }
  .message .source-pill:hover {
    opacity: 0.8;
  }
  .chat-input-area {
  padding: 12px;
  background: var(--vscode-editor-background);
}
.composer {
  border: 1px solid var(--vscode-input-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  background: var(--vscode-input-background, rgba(255, 255, 255, 0.04));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  overflow: hidden;
}
.composer:focus-within {
  border-color: var(--vscode-focusBorder, #3794ff);
  box-shadow: 0 0 0 1px var(--vscode-focusBorder, #3794ff);
}
.composer textarea {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--vscode-input-foreground);
  padding: 12px 14px 4px 14px;
  font-family: var(--vscode-font-family, sans-serif);
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  min-height: 24px;
  max-height: 200px;
  box-sizing: border-box;
  display: block;
}
.composer textarea::placeholder {
  color: var(--vscode-input-placeholderForeground, #888);
}
.composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px 8px 14px;
}
.composer-hint {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  user-select: none;
}
.composer-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
.icon-btn {
  background: transparent;
  border: none;
  color: var(--vscode-foreground);
  opacity: 0.55;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.icon-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.08));
}
.send-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.send-btn:hover {
  background: var(--vscode-button-hoverBackground);
}
.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.send-btn svg,
.icon-btn svg {
  display: block;
}
  #askProgress {
    margin-top: 6px;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    font-style: italic;
    min-height: 1em;
  }
  .history-content {
  padding: 16px;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.history-header h1 {
  margin: 0;
}
#historyStatus {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  margin-bottom: 8px;
  font-style: italic;
}
.commit {
  padding: 10px 0;
  border-bottom: 1px solid var(--vscode-panel-border, #333);
}
.commit:last-child {
  border-bottom: none;
}
.commit-subject {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--vscode-foreground);
  word-break: break-word;
}
.commit-meta {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.commit-hash {
  font-family: var(--vscode-editor-font-family, monospace);
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.commit-author {
  font-weight: 500;
}
.commit-empty {
  color: var(--vscode-descriptionForeground);
  font-style: italic;
  padding: 24px 0;
  text-align: center;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-foreground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.7;
  margin-bottom: 8px;
}
.section-divider {
  margin: 16px 0;
  border: none;
  border-top: 1px solid var(--vscode-panel-border, #333);
}
.selection-empty {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
  padding: 8px 0;
}
.selection-info {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 8px;
  font-family: var(--vscode-editor-font-family, monospace);
}
.selection-info .file-path {
  color: var(--vscode-textLink-foreground);
}
.selection-info .line-range {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 4px;
}

/* Graph toolbar controls */
.graph-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.graph-controls button {
  flex-shrink: 0;
}
.graph-controls input[type="search"] {
  flex: 1;
  padding: 5px 8px;
  font-size: 12px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, #555);
  border-radius: 4px;
  box-sizing: border-box;
  outline: none;
}
.graph-controls input[type="search"]:focus {
  border-color: var(--vscode-focusBorder, #3794ff);
}
.graph-hint {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  margin-top: 4px;
}

/* Right-click context menu */
.graph-context-menu {
  position: fixed;
  background: var(--vscode-menu-background, #2c2c2c);
  color: var(--vscode-menu-foreground, #ccc);
  border: 1px solid var(--vscode-menu-border, #454545);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 200px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 9999;
  font-size: 12px;
  font-family: var(--vscode-font-family, sans-serif);
}
.graph-context-menu .context-item {
  padding: 6px 14px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.graph-context-menu .context-item:hover {
  background: var(--vscode-menu-selectionBackground, #094771);
  color: var(--vscode-menu-selectionForeground, #fff);
}
.graph-context-menu .context-item.context-icon::before {
  content: '';
  display: inline-block;
  width: 16px;
  margin-right: 6px;
}
.graph-context-menu .context-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--vscode-menu-separatorBackground, #454545);
}
.graph-context-menu .context-header {
  padding: 6px 14px 4px 14px;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
  pointer-events: none;
}

h1 .header-action {
  float: right;
  width: 22px;
  height: 22px;
  padding: 0;
  margin-top: -2px;
  vertical-align: middle;
}
  .toolbar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.toolbar-header h1 {
  margin: 0;
}
`;