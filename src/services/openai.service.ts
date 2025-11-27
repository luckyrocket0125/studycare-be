import { openai } from '../config/openai';

export interface ChatOptions {
  subject?: string;
  stepByStep?: boolean;
  language?: string;
  simplifiedMode?: boolean;
}

export class OpenAIService {
  async chatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: ChatOptions
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(options);

    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages,
    ];

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: allMessages,
        temperature: 0.6,
        max_tokens: 2000,
      });

      let content = response.choices[0]?.message?.content || 'No response generated';
      
      // Clean up the response for better formatting
      content = this.cleanResponse(content);
      
      return content;
    } catch (error: any) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  async analyzeImage(imageUrl: string, prompt: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 1500,
      });

      return response.choices[0]?.message?.content || 'No analysis generated';
    } catch (error: any) {
      throw new Error(`OpenAI Vision API error: ${error.message}`);
    }
  }

  async transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
    try {
      const file = new File([audioBuffer], filename, {
        type: 'audio/mpeg',
      });

      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
      });

      return transcription.text;
    } catch (error: any) {
      throw new Error(`OpenAI Whisper API error: ${error.message}`);
    }
  }

  async textToSpeech(text: string, language: string = 'en'): Promise<Buffer> {
    try {
      const voiceMap: Record<string, 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'> = {
        en: 'alloy',
        es: 'nova',
        fr: 'echo',
        de: 'onyx',
        it: 'fable',
        pt: 'shimmer',
      };

      const voice = voiceMap[language] || 'alloy';

      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice,
        input: text,
      });

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      throw new Error(`OpenAI TTS API error: ${error.message}`);
    }
  }

  private buildSystemPrompt(options?: ChatOptions): string {
    let prompt = `You are StudyCare AI, an intelligent and friendly study assistant designed to help students learn effectively.

**RESPONSE GUIDELINES:**
1. Keep responses clear, concise, and well-organized
2. Use proper formatting with paragraphs and line breaks for readability
3. Structure your answers logically
4. Be direct and avoid unnecessary repetition
5. Use bullet points or numbered lists when explaining multiple concepts
6. Maintain a consistent, professional tone

**FORMATTING RULES:**
- Use clear paragraphs (separate ideas with blank lines)
- Use bullet points (•) or numbered lists for step-by-step instructions
- Use **bold** for important terms or key concepts
- Keep sentences concise and easy to understand
- Avoid long, run-on sentences`;

    if (options?.subject) {
      prompt += `\n\n**CURRENT SUBJECT:** ${options.subject}`;
    }

    if (options?.stepByStep) {
      prompt +=
        '\n\n**EXPLANATION STYLE:** Always provide clear, step-by-step explanations. Break down complex concepts into manageable parts. Number each step clearly.';
    }

    if (options?.simplifiedMode) {
      prompt +=
        '\n\n**LANGUAGE LEVEL:** Use simple language suitable for younger students. Explain concepts in an easy-to-understand way. Avoid technical jargon.';
    }

    if (options?.language && options.language !== 'en') {
      prompt += `\n\n**LANGUAGE:** Respond in ${this.getLanguageName(options.language)}.`;
    }

    prompt +=
      '\n\n**TONE:** Be encouraging, patient, and supportive. Focus on helping the student understand, not just providing answers.';

    return prompt;
  }

  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      ar: 'Arabic',
      hi: 'Hindi',
      tr: 'Turkish',
      pl: 'Polish',
      nl: 'Dutch',
    };

    return languages[code] || code;
  }

  private cleanResponse(response: string): string {
    // Remove excessive whitespace
    let cleaned = response.trim();
    
    // Ensure proper paragraph spacing (max 2 newlines)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    // Remove leading/trailing whitespace from each line
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
    
    // Ensure consistent spacing around bullet points
    cleaned = cleaned.replace(/\n\s*[•\-\*]\s*/g, '\n• ');
    
    // Ensure consistent spacing around numbered lists
    cleaned = cleaned.replace(/\n\s*(\d+)\.\s*/g, '\n$1. ');
    
    return cleaned.trim();
  }
}

