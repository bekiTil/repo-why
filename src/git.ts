import simpleGit, { SimpleGit } from 'simple-git';

export interface Commit {
  /** Full SHA hash, e.g. 'a3b1c2d4e5...'. */
  hash: string;
  /** First 7 characters of the hash. */
  shortHash: string;
  /** Commit author's name. */
  author: string;
  /** Commit author's email. */
  email: string;
  /** ISO 8601 date string. */
  date: string;
  /** First line of the commit message (the subject). */
  subject: string;
  /** Everything after the first line (the body). May be empty. */
  body: string;
}

/**
 * Whether the given folder is inside a git repository.
 */
export async function isGitRepo(workspaceRoot: string): Promise<boolean> {
  try {
    const git: SimpleGit = simpleGit(workspaceRoot);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

/**
 * Read recent commits from the workspace's git repo.
 * Returns up to `limit` commits, newest first.
 * Throws if the workspace isn't a git repo.
 */
export async function getRecentCommits(
  workspaceRoot: string,
  limit: number = 50,
): Promise<Commit[]> {
  const git = simpleGit(workspaceRoot);

  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error('This folder is not a git repository.');
  }

  const log = await git.log({ maxCount: limit });

  return log.all.map((entry) => {
    const message = entry.message || '';
    // simple-git returns the subject in `message` and the rest in `body`.
    return {
      hash: entry.hash,
      shortHash: entry.hash.slice(0, 7),
      author: entry.author_name,
      email: entry.author_email,
      date: entry.date,
      subject: message,
      body: entry.body || '',
    };
  });
}

/**
 * Run git blame for a specific line range in a file.
 * Returns the unique commits that touched any line in the range,
 * sorted by date with most recent first.
 */
export async function getBlameForRange(
  workspaceRoot: string,
  filePath: string,
  startLine: number,
  endLine: number,
): Promise<Commit[]> {
  const git = simpleGit(workspaceRoot);

  // -l forces long (full) commit hashes for unambiguous lookup.
  const blameOutput = await git.raw([
    'blame',
    '-l',
    'HEAD',
    `-L${startLine},${endLine}`,
    '--',
    filePath,
  ]);
  console.log('[Repo Why blame]', {
  filePath,
  startLine,
  endLine,
  outputPreview: blameOutput.split('\n').slice(0, 3),
  hashesFound: 'will compute below',
});
console.log('[Repo Why blame] file:', filePath, 'lines:', startLine, '-', endLine);
console.log('[Repo Why blame] RAW OUTPUT:');
console.log(blameOutput);
console.log('[Repo Why blame] FIRST LINE CHARS:',
  (blameOutput.split('\n')[0] || '')
    .slice(0, 50)
    .split('')
    .map((c) => `${c}(${c.charCodeAt(0)})`)
    .join(' ')
);

  // Each line of blame output starts with a 40-char hex hash.
  const hashes = new Set<string>();
  for (const line of blameOutput.split('\n')) {
    const match = line.match(/^\^?([a-f0-9]{39,40})/);
    if (match) hashes.add(match[1]);
  }
  console.log('[Repo Why blame] hashes:', Array.from(hashes));

  // Look up commit details for each unique hash, in parallel.
  const commitResults = await Promise.all(
    Array.from(hashes).map((h) => getCommitByHash(workspaceRoot, h)),
  );
  const commits = commitResults.filter((c): c is Commit => c !== null);

  // Newest first
  commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return commits;
}

/**
 * Look up a single commit's metadata by hash.
 * Returns null if the hash doesn't resolve (rare — usually means a partial hash).
 */

export async function getCommitByHash(
  workspaceRoot: string,
  hash: string,
): Promise<Commit | null> {
  console.log('[Repo Why getCommit] called with hash:', hash, 'len:', hash.length);
  try {
    const git = simpleGit(workspaceRoot);

    // A unique multi-char separator. Avoids fragile NUL-byte handling.
    const SEP = '<<|REPOWHY_SEP|>>';
    const FORMAT = `%H${SEP}%an${SEP}%ae${SEP}%aI${SEP}%s${SEP}%b`;

    const output = await git.raw([
      'show',
      '--no-patch',
      `--format=${FORMAT}`,
      hash,
    ]);

    console.log('[Repo Why getCommit] raw output (first 200 chars):',
      JSON.stringify(output.slice(0, 200)));
    console.log('[Repo Why getCommit] split parts count:',
      output.split(SEP).length);

    const parts = output.split(SEP);
    if (parts.length < 6) {
      console.log('[Repo Why getCommit] not enough parts, returning null');
      return null;
    }

    const fullHash = parts[0].trim();
    return {
      hash: fullHash,
      shortHash: fullHash.slice(0, 7),
      author: parts[1].trim(),
      email: parts[2].trim(),
      date: parts[3].trim(),
      subject: parts[4].trim(),
      body: (parts[5] || '').trim(),
    };
  } catch (err: any) {
    console.log('[Repo Why getCommit] FAILED for hash:', hash);
    console.log('[Repo Why getCommit] error:', err?.message || err);
    return null;
  }
}

/**
 * Get the diff for a specific commit, filtered to one file.
 * Returns the patch text (the lines starting with @@ and +/- lines).
 */
export async function getCommitDiff(
  workspaceRoot: string,
  commitHash: string,
  filePath: string,
): Promise<string> {
  try {
    const git = simpleGit(workspaceRoot);
    // -1 limits to one commit. Show only the patch for the given file.
    const output = await git.raw([
      'show',
      '--no-color',
      '--format=',
      '--unified=3',
      commitHash,
      '--',
      filePath,
    ]);
    return output;
  } catch {
    return '';
  }
}