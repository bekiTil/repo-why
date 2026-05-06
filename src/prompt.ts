import { ChatMessage } from './llm';
import { RetrievedFile } from './retrieval';
import { Commit } from './git';

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions about a software codebase.

You'll be given excerpts from the user's project. Use them to answer concretely:
- Reference specific files and functions by name when relevant
- Quote short code snippets where useful
- If the answer isn't clear from the provided files, say so honestly rather than guessing
- Keep answers focused on what was asked
- Use markdown for formatting (especially code blocks with language tags)`;

export interface ConversationTurn {
  question: string;
  answer: string;
}

export function buildQaMessages(
  question: string,
  files: RetrievedFile[],
  history: ConversationTurn[] = [],
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // Replay previous turns. We don't re-include file context for these —
  // the answers themselves carry forward enough memory.
  for (const turn of history) {
    messages.push({ role: 'user', content: turn.question });
    messages.push({ role: 'assistant', content: turn.answer });
  }

  // Current turn — only this turn includes the file context.
  const fileSection = files
    .map((f) => `## ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  messages.push({
    role: 'user',
    content: `Here are the most relevant files from the project for this question:

${fileSection}

# Question
${question}`,
  });

  return messages;
}

const WHY_SYSTEM_PROMPT = `You are a code archaeologist. Your job is to explain WHY a piece of code exists, using git history as your primary evidence.

You'll be given:
- The selected code
- The commits that touched those lines (author, date, commit message)
- The diffs from those commits showing what changed
- Sometimes additional context from the surrounding file

Use this evidence to answer the user's "why does this exist?" question. Specifically:
- Identify the original commit(s) that introduced this code
- Quote the commit message if it's informative
- Explain what problem the code was solving based on the diff
- If multiple commits modified the code, summarize how it evolved
- Be concrete: name the contributors, dates, and reasoning
- If the commits don't make the reasoning clear, say so honestly — don't invent motives

Format the answer in markdown. Keep it focused — usually 2-5 short paragraphs is right. Don't pad.`;

export interface WhyContext {
  filePath: string;
  startLine: number;
  endLine: number;
  selectedCode: string;
  commits: Array<{
    commit: Commit;
    diff: string;
  }>;
}

export function buildWhyMessages(ctx: WhyContext): ChatMessage[] {
  const codeBlock = '```\n' + ctx.selectedCode + '\n```';

  const commitSections = ctx.commits.map((entry, i) => {
    const c = entry.commit;
    const date = new Date(c.date).toLocaleDateString();
    return `### Commit ${i + 1}: ${c.shortHash} — ${c.subject}

- Author: ${c.author} <${c.email}>
- Date: ${date}
${c.body ? `- Message body:\n\n${c.body}\n` : ''}
**Diff (this file only):**
\`\`\`diff
${entry.diff || '(empty)'}
\`\`\``;
  }).join('\n\n');

  const userContent = `## Code in question

\`${ctx.filePath}\` (lines ${ctx.startLine}-${ctx.endLine}):

${codeBlock}

## Git history for these lines

${commitSections || '(No commit history found — this code may be uncommitted.)'}

## Question

Why does this code exist? Explain the reasoning, what problem it solves, and any context you can extract from the commits above.`;

  return [
    { role: 'system', content: WHY_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}