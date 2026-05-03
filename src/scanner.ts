import * as vscode from 'vscode';

/**
 * File extensions we treat as "source code" worth analyzing.
 * Keep this aligned with the languages our parser will support.
 */
const SOURCE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py',
  'go',
  'rs',
  'java', 'kt',
  'c', 'cpp', 'h', 'hpp',
  'cs',
  'rb',
  'php',
  'swift',
  'vue', 'svelte', 'astro',
];

/**
 * Folders and files we never want to scan.
 * Generated output, dependencies, lockfiles, build artifacts.
 */
const EXCLUDE_GLOBS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/target/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/.mypy_cache/**',
  '**/.pytest_cache/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.lock',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/Cargo.lock',
  '**/Pipfile.lock',
  '**/poetry.lock',
];

export interface ScannedFile {
  /** Path relative to the workspace root, for display. */
  relativePath: string;
  /** Absolute filesystem path, for reading file contents later. */
  absolutePath: string;
  /** File extension without the dot, e.g. "ts", "py". */
  extension: string;
}

/**
 * Scan the currently open workspace folder for source files.
 *
 * Returns an array of files with both relative and absolute paths.
 * Skips common dependency, build, and generated-output folders.
 *
 * Throws if no workspace folder is open.
 */
export async function scanWorkspace(): Promise<ScannedFile[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No folder is open. Open a project in VS Code to scan.');
  }

  const root = folders[0].uri.fsPath;

  const includePattern = `**/*.{${SOURCE_EXTENSIONS.join(',')}}`;
  const excludePattern = `{${EXCLUDE_GLOBS.join(',')}}`;

  const uris = await vscode.workspace.findFiles(includePattern, excludePattern);

  const files: ScannedFile[] = uris.map((uri) => {
    const absolutePath = uri.fsPath;
    const relativePath = relativeTo(root, absolutePath);
    const extension = absolutePath.split('.').pop() ?? '';
    return { relativePath, absolutePath, extension };
  });

  // Stable, alphabetical order so output is deterministic.
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return files;
}

/**
 * Convert an absolute path to one relative to the workspace root.
 * Handles both Unix and Windows path separators.
 */
function relativeTo(root: string, absolutePath: string): string {
  const normalizedRoot = root.endsWith('/') || root.endsWith('\\') ? root : root + '/';
  if (absolutePath.startsWith(normalizedRoot)) {
    return absolutePath.slice(normalizedRoot.length);
  }
  // Fallback: try Windows-style separator
  const winRoot = root.replace(/\\/g, '/') + '/';
  const winPath = absolutePath.replace(/\\/g, '/');
  if (winPath.startsWith(winRoot)) {
    return winPath.slice(winRoot.length);
  }
  return absolutePath;
}