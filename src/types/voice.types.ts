export interface VoiceTranscription {
  text: string;
  sessionId?: string;
}

export interface VoiceSynthesis {
  audioUrl: string;
  sessionId?: string;
}

export interface VoiceChatRequest {
  audioFile: Buffer;
  filename: string;
  sessionId?: string;
  language?: string;
}

export interface VoiceChatResponse {
  transcription: string;
  aiResponse: string;
  audioUrl?: string;
  sessionId: string;
}

