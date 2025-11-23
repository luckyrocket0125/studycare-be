import { supabase } from '../config/database';
import { OpenAIService } from './openai.service';
import { StorageService } from './storage.service';
import { createError } from '../middleware/error.middleware';
import { VoiceTranscription, VoiceSynthesis, VoiceChatResponse } from '../types/voice.types';

export class VoiceService {
  private openai: OpenAIService;
  private storage: StorageService;

  constructor() {
    this.openai = new OpenAIService();
    this.storage = new StorageService();
  }

  async transcribeAudio(
    userId: string,
    audioBuffer: Buffer,
    filename: string,
    sessionId?: string
  ): Promise<VoiceTranscription> {
    const transcription = await this.openai.transcribeAudio(audioBuffer, filename);

    if (sessionId) {
      const { data: session } = await supabase
        .from('study_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (session) {
        await supabase.from('chat_messages').insert({
          session_id: sessionId,
          user_id: userId,
          message_type: 'user',
          content: transcription,
          metadata: { source: 'voice' },
        });
      }
    }

    return {
      text: transcription,
      sessionId: sessionId,
    };
  }

  async synthesizeSpeech(
    userId: string,
    text: string,
    language: string = 'en',
    sessionId?: string
  ): Promise<VoiceSynthesis> {
    const audioBuffer = await this.openai.textToSpeech(text, language);
    const filename = `tts-${Date.now()}.mp3`;
    const audioUrl = await this.storage.uploadFile(audioBuffer, filename, 'audio');

    if (sessionId) {
      const { data: session } = await supabase
        .from('study_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (session) {
        await supabase.from('chat_messages').insert({
          session_id: sessionId,
          user_id: userId,
          message_type: 'assistant',
          content: text,
          metadata: { source: 'tts', audioUrl },
        });
      }
    }

    return {
      audioUrl,
      sessionId: sessionId,
    };
  }

  async voiceChat(
    userId: string,
    audioBuffer: Buffer,
    filename: string,
    language: string = 'en',
    sessionId?: string
  ): Promise<VoiceChatResponse> {
    let session = sessionId ? await this.getOrCreateSession(userId, sessionId) : await this.createSession(userId);

    const transcription = await this.openai.transcribeAudio(audioBuffer, filename);

    await supabase.from('chat_messages').insert({
      session_id: session.id,
      user_id: userId,
      message_type: 'user',
      content: transcription,
      metadata: { source: 'voice' },
    });

    const history = await this.getMessageHistory(session.id, 10);
    const messages = history.map((msg) => ({
      role: msg.message_type === 'user' ? ('user' as const) : ('assistant' as const),
      content: msg.content,
    }));

    messages.push({ role: 'user', content: transcription });

    const aiResponse = await this.openai.chatCompletion(messages, {
      language,
      stepByStep: true,
    });

    await supabase.from('chat_messages').insert({
      session_id: session.id,
      user_id: userId,
      message_type: 'assistant',
      content: aiResponse,
      metadata: { source: 'voice' },
    });

    const audioBufferResponse = await this.openai.textToSpeech(aiResponse, language);
    const audioFilename = `tts-${Date.now()}.mp3`;
    const audioUrl = await this.storage.uploadFile(audioBufferResponse, audioFilename, 'audio');

    return {
      transcription,
      aiResponse,
      audioUrl,
      sessionId: session.id,
    };
  }

  private async createSession(userId: string): Promise<{ id: string }> {
    const { data: session, error } = await supabase
      .from('study_sessions')
      .insert({
        user_id: userId,
        session_type: 'voice',
      })
      .select('id')
      .single();

    if (error || !session) {
      throw createError('Failed to create voice session', 500);
    }

    return session;
  }

  private async getOrCreateSession(userId: string, sessionId: string): Promise<{ id: string }> {
    const { data: session, error } = await supabase
      .from('study_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (error || !session) {
      return this.createSession(userId);
    }

    return session;
  }

  private async getMessageHistory(sessionId: string, limit: number = 10): Promise<any[]> {
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      return [];
    }

    return messages || [];
  }
}

