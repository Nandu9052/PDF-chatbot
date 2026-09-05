import {
  DOCUMENT_RESPONSE_PROMPT,
} from '../../src/retrieval_graph/prompts.js';
import { cleanResponseText } from '../../src/retrieval_graph/utils.js';

describe('Prompt Templates & Utilities', () => {
  describe('DOCUMENT_RESPONSE_PROMPT', () => {
    it('should format the response prompt correctly with strict grounding', async () => {
      const context = 'Paris is the capital of France.';
      const question = 'Tell me about the capital of France.';

      const formattedPrompt = await DOCUMENT_RESPONSE_PROMPT.invoke({
        context,
        question,
      });

      const promptStr = formattedPrompt.toString();
      expect(promptStr).toContain('You are a helpful, expert AI assistant');
      expect(promptStr).toContain(context);
      expect(promptStr).toContain(question);
    });
  });

  describe('cleanResponseText', () => {
    it('should clean and trim response text properly', () => {
      const input = '   \n\n**Magadheera (2009)**\n\nDirector: S. S. Rajamouli\n\n   ';
      const output = cleanResponseText(input);

      expect(output).toBe('**Magadheera (2009)**\n\nDirector: S. S. Rajamouli');
    });

    it('should handle empty or null string gracefully', () => {
      expect(cleanResponseText('')).toBe('');
    });
  });
});
