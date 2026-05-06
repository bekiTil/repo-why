import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new SidebarProvider(context);


  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      provider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('repo-why.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from repo-why!');
    })
  );

  // The differentiator: right-click → "Why does this exist?"
  context.subscriptions.push(
    vscode.commands.registerCommand('repoWhy.askWhy', async () => {
      await provider.askWhyForSelection();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('repoWhy.openInEditor', () => {
    provider.openInEditor();
  })
);
}

export function deactivate() {}