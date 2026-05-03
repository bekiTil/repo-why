import { ScannedFile } from './scanner';
import { parseImports } from './parser';

export interface GraphNode {
  /** Stable identifier — the file's path relative to the workspace root. */
  id: string;
  /** Friendly label for display (basename or relative path). */
  label: string;
  /** Absolute filesystem path. */
  absolutePath: string;
  /** External packages this file imports (e.g. ['react', 'lodash']). */
  externalImports: string[];
}

export interface GraphEdge {
  /** Importing file's id (relative path). */
  from: string;
  /** Imported file's id (relative path). */
  to: string;
  /** The original specifier from the import statement, e.g. './foo'. */
  specifier: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Build a project-wide dependency graph from a set of scanned files.
 * Each file becomes a node; each resolved local import becomes an edge.
 */
export async function buildGraph(
  files: ScannedFile[],
  workspaceRoot: string,
): Promise<DependencyGraph> {
  // Look up table: absolute path -> relative path (= node id)
  // Used to map the parser's resolved absolute paths back to node ids.
  const absoluteToRelative = new Map<string, string>();
  for (const file of files) {
    absoluteToRelative.set(file.absolutePath, file.relativePath);
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Parse every file in parallel — much faster on big repos than sequential.
  const parsedPerFile = await Promise.all(
    files.map(async (file) => ({
      file,
      imports: await parseImports(file.absolutePath),
    })),
  );

  for (const { file, imports } of parsedPerFile) {
    const externalImports: string[] = [];

    for (const imp of imports) {
      if (imp.kind === 'external') {
        externalImports.push(imp.specifier);
        continue;
      }

      // Local import. Only emit an edge if it resolved AND the target is in our graph.
      if (!imp.resolvedPath) continue;
      const targetId = absoluteToRelative.get(imp.resolvedPath);
      if (!targetId) continue;

      // Skip self-edges.
      if (targetId === file.relativePath) continue;

      edges.push({
        from: file.relativePath,
        to: targetId,
        specifier: imp.specifier,
      });
    }

    nodes.push({
      id: file.relativePath,
      label: file.relativePath,
      absolutePath: file.absolutePath,
      externalImports: dedupe(externalImports),
    });
  }

  return { nodes, edges };
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}