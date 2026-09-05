import { Document } from '@langchain/core/documents';

export function formatDoc(doc: Document): string {
  const metadata = doc.metadata || {};
  const meta = Object.entries(metadata)
    .map(([k, v]) => ` ${k}=${v}`)
    .join('');
  const metaStr = meta ? ` ${meta}` : '';

  return `<document${metaStr}>\n${doc.pageContent}\n</document>`;
}

export function formatDocs(docs?: Document[]): string {
  /** Format a list of documents as XML or return empty string. */
  if (!docs || docs.length === 0) {
    return '';
  }
  const formatted = docs.map(formatDoc).join('\n');
  return `<documents>\n${formatted}\n</documents>`;
}

/**
 * Normalizes LLM responses to ensure clean, trimmed content ready for rich Markdown rendering.
 */
export function cleanResponseText(text: string): string {
  if (!text) return '';
  return text.trim();
}

