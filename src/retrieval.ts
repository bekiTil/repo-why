import * as fs from 'fs/promises';
import { ScannedFile } from './scanner';

export interface RetrievedFile {
  relativePath: string;
  content: string;
}

export interface RetrievalOptions {
  question: string;
  files: ScannedFile[];
  /** Max number of files to include in the result. Default 12. */
  maxFiles?: number;
  /** Max bytes per file. Files larger than this get truncated. Default 4000. */
  maxBytesPerFile?: number;
}

/**
 * Pick the most relevant files for a given question using keyword matching.
 * Reads file contents, scores by overlap with question keywords, returns top N.
 * If no keywords match anything, falls back to the first N files alphabetically.
 */
export async function retrieveRelevantFiles(
  options: RetrievalOptions,
): Promise<RetrievedFile[]> {
  const { question, files, maxFiles = 12, maxBytesPerFile = 4000 } = options;

  const keywords = tokenize(question);

  // Read all file contents in parallel.
  const fileContents = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fs.readFile(file.absolutePath, 'utf-8');
        return { file, content };
      } catch {
        return { file, content: '' };
      }
    }),
  );

  // If we couldn't extract useful keywords, just take the first N files.
  if (keywords.length === 0) {
    return fileContents.slice(0, maxFiles).map(({ file, content }) => ({
      relativePath: file.relativePath,
      content: truncate(content, maxBytesPerFile),
    }));
  }

  // Score each file by keyword overlap.
  const scored = fileContents.map(({ file, content }) => {
    const lowerContent = content.toLowerCase();
    const lowerPath = file.relativePath.toLowerCase();
    let score = 0;
    for (const keyword of keywords) {
      // Path matches are strong signal — files named after concepts in the
      // question are probably relevant.
      if (lowerPath.includes(keyword)) score += 10;
      // Content matches: count up to 20 occurrences per keyword.
      const matches = countOccurrences(lowerContent, keyword);
      score += Math.min(matches, 20);
    }
    return { file, content, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, maxFiles);

  // Nothing matched? Fall back to first N alphabetically.
  if (top.length === 0) {
    return fileContents.slice(0, maxFiles).map(({ file, content }) => ({
      relativePath: file.relativePath,
      content: truncate(content, maxBytesPerFile),
    }));
  }

  return top.map(({ file, content }) => ({
    relativePath: file.relativePath,
    content: truncate(content, maxBytesPerFile),
  }));
}

/**
 * Convert a question to a list of search keywords.
 * Lowercases, splits on non-word chars, drops short and very common words.
 */
function tokenize(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function truncate(s: string, maxBytes: number): string {
  if (s.length <= maxBytes) return s;
  return s.slice(0, maxBytes) + '\n... [truncated]';
}

const STOPWORDS = new Set([
  'the', 'and', 'are', 'but', 'for', 'not', 'with', 'you', 'this', 'that',
  'have', 'from', 'has', 'was', 'one', 'all', 'can', 'does', 'did', 'were',
  'would', 'should', 'could', 'will', 'shall', 'about', 'into', 'over',
  'under', 'between', 'where', 'when', 'what', 'which', 'how', 'why', 'who',
  'use', 'used', 'using', 'set', 'get', 'add', 'app', 'code', 'file',
  'function', 'class',
]);