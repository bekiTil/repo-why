import { ChatMessage } from './llm';
import { RetrievedFile } from './retrieval';

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