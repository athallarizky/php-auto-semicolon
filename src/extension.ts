import * as vscode from 'vscode';
import { analyze } from './analyze';

const MAX_LINES = 100_000;
const MAX_BYTES = 5 * 1024 * 1024;

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('PHP Smart Semicolon', { log: true });

  context.subscriptions.push(
    log,
    vscode.workspace.onWillSaveTextDocument((event) => {
      onWillSave(event, log);
    }),
    vscode.commands.registerCommand('phpAutoSemi.insertSemicolons', () => {
      void onManualCommand(log);
    }),
  );

  log.info('PHP Smart Semicolon activated');
}

export function deactivate(): undefined {
  return;
}

function onWillSave(event: vscode.TextDocumentWillSaveEvent, log: vscode.LogOutputChannel): void {
  const document = event.document;

  if (!shouldProcess(document)) {
    return;
  }

  const edits = analyze(document.getText());
  if (edits.length === 0) {
    return;
  }

  log.debug(`Inserting ${edits.length} semicolon(s) on save`);
  event.waitUntil(
    Promise.resolve(
      edits.map((e) => vscode.TextEdit.insert(new vscode.Position(e.line, e.character), e.text)),
    ),
  );
}

async function onManualCommand(log: vscode.LogOutputChannel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'php') {
    vscode.window.showInformationMessage('PHP Smart Semicolon: open a PHP file first.');
    return;
  }

  if (!isEnabled()) {
    vscode.window.showInformationMessage('PHP Smart Semicolon is disabled (phpAutoSemi.enable).');
    return;
  }

  const edits = analyze(editor.document.getText());
  if (edits.length === 0) {
    vscode.window.setStatusBarMessage('PHP Smart Semicolon: no missing semicolons found', 4000);
    return;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.set(
    editor.document.uri,
    edits.map((e) => vscode.TextEdit.insert(new vscode.Position(e.line, e.character), e.text)),
  );

  const applied = await vscode.workspace.applyEdit(workspaceEdit);
  if (applied) {
    log.debug(`Inserted ${edits.length} semicolon(s) via command`);
    vscode.window.setStatusBarMessage(`PHP Smart Semicolon: inserted ${edits.length} semicolon(s)`, 4000);
  }
}

function shouldProcess(document: vscode.TextDocument): boolean {
  if (document.languageId !== 'php') {
    return false;
  }

  const config = vscode.workspace.getConfiguration('phpAutoSemi');
  if (!config.get<boolean>('enable', true) || !config.get<boolean>('runOnSave', true)) {
    return false;
  }

  if (isIgnored(document, config.get<string[]>('ignoreFiles', []))) {
    return false;
  }

  if (document.lineCount > MAX_LINES || document.getText().length > MAX_BYTES) {
    return false;
  }

  return document.getText().includes('<?');
}

function isIgnored(document: vscode.TextDocument, patterns: string[]): boolean {
  return patterns.some(
    (pattern) => vscode.languages.match({ pattern } as vscode.DocumentSelector, document) > 0,
  );
}

function isEnabled(): boolean {
  return vscode.workspace.getConfiguration('phpAutoSemi').get<boolean>('enable', true);
}
