import { supabase } from '../config/database';
import { OpenAIService } from './openai.service';
import { createError } from '../middleware/error.middleware';
import { SymptomCheckDto, SymptomGuidance, SymptomCheck } from '../types/symptom.types';

export class SymptomService {
  private openai: OpenAIService;

  constructor() {
    this.openai = new OpenAIService();
  }

  async checkSymptoms(userId: string, data: SymptomCheckDto): Promise<SymptomGuidance> {
    const systemPrompt = `You are a health information assistant providing EDUCATIONAL GUIDANCE ONLY. You must NEVER:
- Diagnose any medical condition
- Prescribe treatments or medications
- Provide medical advice
- Suggest specific diseases or conditions

You MUST:
- Provide general educational information about symptoms
- Explain when to seek professional medical help
- Assess severity level (mild, moderate, severe, emergency)
- Always recommend consulting healthcare professionals
- Include clear disclaimers that this is not medical advice

Format your response as JSON:
{
  "guidance": "General educational guidance about the symptoms (2-3 sentences)",
  "educationalInfo": "Educational information about common causes and general knowledge (3-4 sentences)",
  "whenToSeekHelp": "Clear guidance on when to consult a healthcare professional (2-3 sentences)",
  "severityLevel": "mild" | "moderate" | "severe" | "emergency",
  "disclaimer": "This is educational information only and not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition."
}`;

    const userPrompt = `User reported symptoms: ${data.symptoms}
${data.additionalInfo ? `Additional information: ${data.additionalInfo}` : ''}

Provide safe, non-diagnostic educational guidance following the system instructions.`;

    try {
      const { data: user } = await supabase
        .from('users')
        .select('simplified_mode')
        .eq('id', userId)
        .single();

      const response = await this.openai.chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { stepByStep: false, simplifiedMode: user?.simplified_mode || false }
      );

      let jsonText = response.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const guidance = JSON.parse(jsonText) as SymptomGuidance;

      const { data: session, error: sessionError } = await supabase
        .from('study_sessions')
        .insert({
          user_id: userId,
          session_type: 'symptom',
        })
        .select()
        .single();

      if (sessionError || !session) {
        throw createError('Failed to create symptom session', 500);
      }

      await supabase.from('chat_messages').insert({
        session_id: session.id,
        user_id: userId,
        message_type: 'user',
        content: data.symptoms,
        metadata: { source: 'symptom_check', additionalInfo: data.additionalInfo },
      });

      await supabase.from('chat_messages').insert({
        session_id: session.id,
        user_id: userId,
        message_type: 'assistant',
        content: guidance.guidance,
        metadata: { source: 'symptom_check', severityLevel: guidance.severityLevel },
      });

      return guidance;
    } catch (error: any) {
      console.error('Symptom check error:', error);
      throw createError(`Failed to generate symptom guidance: ${error.message}`, 500);
    }
  }

  async getSymptomHistory(userId: string): Promise<SymptomCheck[]> {
    const { data: sessions, error: sessionsError } = await supabase
      .from('study_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('session_type', 'symptom')
      .order('created_at', { ascending: false })
      .limit(50);

    if (sessionsError) {
      throw createError('Failed to fetch symptom history', 500);
    }

    if (!sessions || sessions.length === 0) {
      return [];
    }

    const sessionIds = sessions.map((s) => s.id);

    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false });

    if (messagesError) {
      throw createError('Failed to fetch symptom messages', 500);
    }

    const checks: SymptomCheck[] = [];
    const processedSessions = new Set<string>();

    for (const message of messages || []) {
      if (processedSessions.has(message.session_id)) continue;

      if (message.message_type === 'user') {
        const assistantMessage = messages.find(
          (m) => m.session_id === message.session_id && m.message_type === 'assistant'
        );

        if (assistantMessage) {
          checks.push({
            id: message.id,
            user_id: message.user_id,
            session_id: message.session_id,
            symptoms: message.content,
            guidance: assistantMessage.content,
            severity_level: assistantMessage.metadata?.severityLevel,
            created_at: message.created_at,
          });
          processedSessions.add(message.session_id);
        }
      }
    }

    return checks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

