import { supabase } from '../config/database';
import { OpenAIService } from './openai.service';
import { StudySession, ChatMessage, CreateSessionDto, SendMessageDto } from '../types/chat.types';
import { createError } from '../middleware/error.middleware';

export class ChatService {
  private openai: OpenAIService;

  constructor() {
    this.openai = new OpenAIService();
  }

  async createSession(userId: string, data?: CreateSessionDto): Promise<StudySession> {
    const { data: session, error } = await supabase
      .from('study_sessions')
      .insert({
        user_id: userId,
        session_type: 'chat',
        subject: data?.subject || null,
      })
      .select()
      .single();

    if (error || !session) {
      throw createError('Failed to create chat session', 500);
    }

    return session;
  }

  async sendMessage(
    sessionId: string,
    userId: string,
    messageData: SendMessageDto
  ): Promise<{ response: string; message: ChatMessage }> {
    const { message, language } = messageData;

    const session = await this.getSession(sessionId, userId);
    const history = await this.getMessageHistory(sessionId, 10);

    const subject = session.subject || (await this.detectSubject(message));

    if (subject && !session.subject) {
      await supabase
        .from('study_sessions')
        .update({ subject })
        .eq('id', sessionId);
    }

    const userLanguage = language || 'en';

    const { data: userMessage, error: msgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        message_type: 'user',
        content: message,
      })
      .select()
      .single();

    if (msgError || !userMessage) {
      throw createError('Failed to save user message', 500);
    }

    const messages = history.map((msg) => ({
      role: msg.message_type === 'user' ? ('user' as const) : ('assistant' as const),
      content: msg.content,
    }));

    messages.push({ role: 'user', content: message });

    const { data: user } = await supabase
      .from('users')
      .select('simplified_mode')
      .eq('id', userId)
      .single();

    const aiResponse = await this.openai.chatCompletion(messages, {
      subject: subject || undefined,
      stepByStep: true,
      language: userLanguage,
      simplifiedMode: user?.simplified_mode || false,
    });

    const { data: assistantMessage, error: assistantError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        message_type: 'assistant',
        content: aiResponse,
        metadata: { subject, language: userLanguage },
      })
      .select()
      .single();

    if (assistantError || !assistantMessage) {
      throw createError('Failed to save assistant message', 500);
    }

    return {
      response: aiResponse,
      message: assistantMessage,
    };
  }

  async getSession(sessionId: string, userId: string): Promise<StudySession> {
    const { data: session, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (error || !session) {
      throw createError('Session not found', 404);
    }

    return session;
  }

  async getSessions(userId: string): Promise<StudySession[]> {
    const { data: sessions, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('session_type', 'chat')
      .order('created_at', { ascending: false });

    if (error) {
      throw createError('Failed to fetch sessions', 500);
    }

    return sessions || [];
  }

  async getMessageHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw createError('Failed to fetch message history', 500);
    }

    return messages || [];
  }

  private async detectSubject(message: string): Promise<string | null> {
    const subjects: Record<string, string[]> = {
      math: ['math', 'mathematics', 'algebra', 'calculus', 'equation', 'solve', 'formula', 'geometry', 'trigonometry'],
      science: ['science', 'physics', 'chemistry', 'biology', 'molecule', 'atom', 'reaction', 'experiment'],
      history: ['history', 'historical', 'event', 'war', 'civilization', 'ancient', 'medieval', 'renaissance'],
      english: ['english', 'literature', 'grammar', 'essay', 'writing', 'poem', 'novel', 'author'],
      geography: ['geography', 'country', 'continent', 'map', 'climate', 'population'],
      computer: ['computer', 'programming', 'code', 'algorithm', 'software', 'python', 'javascript'],
    };

    const lowerMessage = message.toLowerCase();

    for (const [subject, keywords] of Object.entries(subjects)) {
      if (keywords.some((keyword) => lowerMessage.includes(keyword))) {
        return subject;
      }
    }

    return null;
  }
}

