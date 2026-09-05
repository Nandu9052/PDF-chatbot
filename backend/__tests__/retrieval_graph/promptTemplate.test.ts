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
      expect(promptStr).toContain('You are a factual RAG assistant');
      expect(promptStr).toContain(context);
      expect(promptStr).toContain(question);
    });
  });

  describe('cleanResponseText', () => {
    it('should remove bold, italics, HTML tags, and convert markdown tables to plain text', () => {
      const input = `**Magadheera (2009)**

| Category | Details |
|---|---|
| Director | S. S. Rajamouli |
| Music | M. M. Keeravani |

<br>
<b>Plot:</b>
*Magadheera* is a fantasy-action film.`;

      const output = cleanResponseText(input);

      expect(output).not.toContain('**');
      expect(output).not.toContain('<br>');
      expect(output).not.toContain('<b>');
      expect(output).not.toContain('|---|---|');
      expect(output).toContain('Director: S. S. Rajamouli');
      expect(output).toContain('Music: M. M. Keeravani');
      expect(output).toContain('Plot:');
      expect(output).toContain('Magadheera is a fantasy-action film.');
    });
  });
});

