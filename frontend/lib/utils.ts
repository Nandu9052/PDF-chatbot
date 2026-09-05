import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes LLM responses on the client side to ensure clean, trimmed content ready for rich Markdown rendering.
 */
export function cleanResponseText(text: string): string {
  if (!text) return '';
  return text;
}
