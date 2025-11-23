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
        temperature: 0.7,
        max_tokens: 2000,
      });

      return response.choices[0]?.message?.content || 'No response generated';
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
    let prompt = 'You are StudyCare AI, an intelligent and friendly study assistant designed to help students learn effectively.';

    if (options?.subject) {
      prompt += ` You are currently helping with ${options.subject}.`;
    }

    if (options?.stepByStep) {
      prompt +=
        ' Always provide clear, step-by-step explanations. Break down complex concepts into manageable parts.';
    }

    if (options?.simplifiedMode) {
      prompt +=
        ' Use simple language suitable for younger students. Explain concepts in an easy-to-understand way.';
    }

    if (options?.language && options.language !== 'en') {
      prompt += ` Respond in ${this.getLanguageName(options.language)}.`;
    }

    prompt +=
      ' Be encouraging, patient, and focus on helping the student understand, not just providing answers.';

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
}

