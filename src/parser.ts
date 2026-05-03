import * as path from 'path';
import * as fs from 'fs/promises';

export type ImportKind = 'local' | 'external';

export interface ParsedImport {
  /** The exact string from the import statement, e.g. './foo' or 'react'. */
  specifier: string;
  /** Whether the import targets a project file or an external package. */
  kind: ImportKind;
  /** For local imports: absolute path to the imported file. Null if unresolved or external. */
  resolvedPath: string | null;
}

/**
 * Matches import specifiers in TS/JS source. Captures the string in the quotes.
 * Covers:
 *   import x from 'y'
 *   import { x } from 'y'
 *   import * as x from 'y'
 *   import 'y'
 *   import type { X } from 'y'
 *   require('y')
 *   import('y')
 */
const IMPORT_REGEX =
  /(?:import\s+(?:type\s+)?(?:[\w*\s{},]+\s+from\s+)?|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

const RESOLUTION_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Read a TS/JS file and extract its imports.
 * Returns an array of ParsedImport — local imports resolved to absolute paths,
 * external imports flagged with resolvedPath = null.
 */
export async function parseImports(absolutePath: string): Promise<ParsedImport[]> {
  let content: string;
  try {
    content = await fs.readFile(absolutePath, 'utf-8');
  } catch {
    // Unreadable file (perms, deleted between scan and parse, binary, etc.)
    return [];
  }

  const imports: ParsedImport[] = [];
  const seen = new Set<string>();

  // Always reset state before reusing a /g regex.
  IMPORT_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = IMPORT_REGEX.exec(content)) !== null) {
    const specifier = match[1];

    // Deduplicate within a single file (a file might import 'react' from 3 places).
    if (seen.has(specifier)) continue;
    seen.add(specifier);

    const isLocal =
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier.startsWith('/');

    if (!isLocal) {
      imports.push({ specifier, kind: 'external', resolvedPath: null });
      continue;
    }

    const resolved = await resolveLocalImport(absolutePath, specifier);
    imports.push({ specifier, kind: 'local', resolvedPath: resolved });
  }

  return imports;
}

/**
 * Resolve a local import specifier to an absolute file path.
 * Mirrors a simplified version of Node/TS module resolution:
 *   1. Exact path
 *   2. Path + each known extension
 *   3. Path/index + each known extension
 */
async function resolveLocalImport(
  importingFile: string,
  specifier: string,
): Promise<string | null> {
  const importerDir = path.dirname(importingFile);
  const base = path.resolve(importerDir, specifier);

  // 1. Exact path
  if (await fileExists(base)) return base;

  // 2. With extensions
  for (const ext of RESOLUTION_EXTENSIONS) {
    const candidate = base + ext;
    if (await fileExists(candidate)) return candidate;
  }

  // 3. As a folder containing an index file
  for (const ext of RESOLUTION_EXTENSIONS) {
    const candidate = path.join(base, 'index' + ext);
    if (await fileExists(candidate)) return candidate;
  }

  return null;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}