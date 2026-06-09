import { GoogleGenAI } from '@google/genai';

export interface AiMessage {
  role: 'user' | 'system';
  content: string;
}

/**
 * Send a prompt to whichever AI provider is configured via env vars.
 * OpenRouter takes priority when both keys are present.
 * Throws if no provider is configured.
 */
export async function callAi(messages: AiMessage[]): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (openRouterKey) {
    const model = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://cardledger.app',
        'X-Title': 'CardLedger',
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenRouter returned empty content');
    return text;
  }

  if (geminiKey) {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const userContent = messages.map((m) => m.content).join('\n');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userContent,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        tools: [{ googleSearch: {} }],
      },
    });
    const text = response.text;
    if (!text) throw new Error('Gemini returned empty text');
    return text;
  }

  throw new Error('No AI provider configured — set GEMINI_API_KEY or OPENROUTER_API_KEY');
}
