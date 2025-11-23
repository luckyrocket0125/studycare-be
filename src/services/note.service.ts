import { supabase } from '../config/database';
import { OpenAIService } from './openai.service';
import { createError } from '../middleware/error.middleware';
import { Note, CreateNoteDto, UpdateNoteDto, NoteSummary, NoteExplanation } from '../types/note.types';

export class NoteService {
  private openai: OpenAIService;

  constructor() {
    this.openai = new OpenAIService();
  }

  async createNote(userId: string, data: CreateNoteDto): Promise<Note> {
    const { data: note, error } = await supabase
      .from('notes')
      .insert({
        user_id: userId,
        title: data.title,
        content: data.content,
        tags: data.tags || [],
      })
      .select()
      .single();

    if (error || !note) {
      throw createError('Failed to create note', 500);
    }

    return note;
  }

  async getNotes(userId: string): Promise<Note[]> {
    const { data: notes, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw createError('Failed to fetch notes', 500);
    }

    return notes || [];
  }

  async getNote(noteId: string, userId: string): Promise<Note> {
    const { data: note, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .eq('user_id', userId)
      .single();

    if (error || !note) {
      throw createError('Note not found', 404);
    }

    return note;
  }

  async updateNote(noteId: string, userId: string, data: UpdateNoteDto): Promise<Note> {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.tags !== undefined) updateData.tags = data.tags;

    const { data: note, error } = await supabase
      .from('notes')
      .update(updateData)
      .eq('id', noteId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !note) {
      throw createError('Failed to update note', 500);
    }

    return note;
  }

  async deleteNote(noteId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', userId);

    if (error) {
      throw createError('Failed to delete note', 500);
    }
  }

  async summarizeNote(noteId: string, userId: string): Promise<NoteSummary> {
    const note = await this.getNote(noteId, userId);

    const prompt = `Analyze this note and provide:
1. A concise summary (2-3 sentences)
2. Key points (bullet list of 3-5 main ideas)
3. Suggested tags (3-5 relevant tags)

Note Title: ${note.title}
Note Content: ${note.content}

Format your response as JSON:
{
  "summary": "summary text",
  "keyPoints": ["point1", "point2", ...],
  "suggestedTags": ["tag1", "tag2", ...]
}`;

    try {
      const response = await this.openai.chatCompletion(
        [{ role: 'user', content: prompt }],
        { stepByStep: false }
      );

      let jsonText = response.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const summaryData = JSON.parse(jsonText) as NoteSummary;

      await supabase
        .from('notes')
        .update({ ai_summary: summaryData.summary })
        .eq('id', noteId);

      return summaryData;
    } catch (error: any) {
      console.error('Summary generation error:', error);
      throw createError(`Failed to generate summary: ${error.message}`, 500);
    }
  }

  async explainNote(noteId: string, userId: string): Promise<NoteExplanation> {
    const note = await this.getNote(noteId, userId);

    const prompt = `Explain this note in detail, breaking down complex concepts and providing clear explanations.

Note Title: ${note.title}
Note Content: ${note.content}

Provide:
1. A detailed explanation of the content
2. Key concepts covered (list of 3-7 concepts)

Format your response as JSON:
{
  "explanation": "detailed explanation text",
  "concepts": ["concept1", "concept2", ...]
}`;

    try {
      const { data: user } = await supabase
        .from('users')
        .select('simplified_mode')
        .eq('id', userId)
        .single();

      const response = await this.openai.chatCompletion(
        [{ role: 'user', content: prompt }],
        { stepByStep: true, simplifiedMode: user?.simplified_mode || false }
      );

      let jsonText = response.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const explanationData = JSON.parse(jsonText) as NoteExplanation;

      await supabase
        .from('notes')
        .update({ ai_explanation: explanationData.explanation })
        .eq('id', noteId);

      return explanationData;
    } catch (error: any) {
      console.error('Explanation generation error:', error);
      throw createError(`Failed to generate explanation: ${error.message}`, 500);
    }
  }

  async organizeNote(noteId: string, userId: string): Promise<Note> {
    const note = await this.getNote(noteId, userId);

    const prompt = `Review this note and suggest improvements for better organization and clarity.

Current Note:
Title: ${note.title}
Content: ${note.content}

Provide:
1. An improved title (if needed)
2. Better organized content with clear sections
3. Suggested tags

Format your response as JSON:
{
  "title": "improved title or original if good",
  "content": "reorganized content with clear structure",
  "tags": ["tag1", "tag2", ...]
}`;

    try {
      const { data: user } = await supabase
        .from('users')
        .select('simplified_mode')
        .eq('id', userId)
        .single();

      const response = await this.openai.chatCompletion(
        [{ role: 'user', content: prompt }],
        { stepByStep: false, simplifiedMode: user?.simplified_mode || false }
      );

      let jsonText = response.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const organized = JSON.parse(jsonText) as { title: string; content: string; tags: string[] };

      const updatedNote = await this.updateNote(noteId, userId, {
        title: organized.title,
        content: organized.content,
        tags: organized.tags,
      });

      return updatedNote;
    } catch (error: any) {
      console.error('Organization error:', error);
      throw createError(`Failed to organize note: ${error.message}`, 500);
    }
  }
}

