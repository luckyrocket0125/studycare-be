export type SessionType = 'chat' | 'image' | 'voice' | 'notes' | 'symptom';
export type MessageType = 'user' | 'assistant';

export interface StudySession {
  id: string;
  user_id: string;
  session_type: SessionType;
  subject?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  message_type: MessageType;
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface CreateSessionDto {
  subject?: string;
}

export interface SendMessageDto {
  sessionId: string;
  message: string;
  language?: string;
}

