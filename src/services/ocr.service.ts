import { supabase } from '../config/database';
import { OpenAIService } from './openai.service';
import { StorageService } from './storage.service';
import { createError } from '../middleware/error.middleware';

export interface ImageAnalysisResult {
  ocrText: string;
  explanation: string;
  imageUrl: string;
  sessionId: string;
  id?: string;
  created_at?: string;
}

export interface ImageUpload {
  id: string;
  session_id: string;
  user_id: string;
  file_url: string;
  ocr_text: string | null;
  explanation: string | null;
  created_at: string;
}

export class OCRService {
  private openai: OpenAIService;
  private storage: StorageService;

  constructor() {
    this.openai = new OpenAIService();
    this.storage = new StorageService();
  }

  async uploadAndAnalyze(
    userId: string,
    imageBuffer: Buffer,
    filename: string
  ): Promise<ImageAnalysisResult> {
    const imageUrl = await this.storage.uploadFile(imageBuffer, filename, 'images');

    const { data: session, error: sessionError } = await supabase
      .from('study_sessions')
      .insert({
        user_id: userId,
        session_type: 'image',
      })
      .select()
      .single();

    if (sessionError || !session) {
      throw createError('Failed to create image session', 500);
    }

    const prompt = `Analyze this image carefully. 
    
1. First, extract ALL visible text, equations, numbers, and symbols. If it's handwritten, do your best to read it.
2. Then, provide a clear, step-by-step explanation of what you see.
3. If this appears to be a math problem, solve it step by step showing your work.
4. If it's a diagram, chart, or graph, explain what it represents and the key information it conveys.
5. If it's text content, summarize the main points clearly.

Be thorough and educational in your explanation.`;

    const analysis = await this.openai.analyzeImage(imageUrl, prompt);

    const lines = analysis.split('\n\n');
    const ocrText = lines[0] || 'Text extraction in progress...';
    const explanation = analysis;

    const { error: uploadError } = await supabase.from('image_uploads').insert({
      session_id: session.id,
      user_id: userId,
      file_url: imageUrl,
      ocr_text: ocrText,
      explanation: explanation,
    });

    if (uploadError) {
      throw createError('Failed to save image analysis', 500);
    }

    return {
      ocrText,
      explanation,
      imageUrl,
      sessionId: session.id,
    };
  }

  async getImageAnalysis(sessionId: string, userId: string): Promise<ImageAnalysisResult> {
    const { data: imageData, error } = await supabase
      .from('image_uploads')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .single();

    if (error || !imageData) {
      throw createError('Image analysis not found', 404);
    }

    return {
      ocrText: imageData.ocr_text || '',
      explanation: imageData.explanation || '',
      imageUrl: imageData.file_url,
      sessionId: imageData.session_id,
      id: imageData.id,
      created_at: imageData.created_at,
    };
  }

  async getAllImageAnalyses(userId: string): Promise<ImageUpload[]> {
    const { data: images, error } = await supabase
      .from('image_uploads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw createError('Failed to fetch image analyses', 500);
    }

    return images || [];
  }

  async askQuestionAboutImage(
    sessionId: string,
    userId: string,
    question: string
  ): Promise<string> {
    const { data: imageData, error } = await supabase
      .from('image_uploads')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .single();

    if (error || !imageData) {
      throw createError('Image analysis not found', 404);
    }

    const prompt = `Based on this image that was previously analyzed, answer the following question: "${question}"

Previous analysis context:
${imageData.explanation || 'No previous analysis available'}

Provide a clear, helpful answer to the question. If the question is about something not visible in the image, let the user know.`;

    const answer = await this.openai.analyzeImage(imageData.file_url, prompt);

    return answer;
  }

  async deleteImageAnalysis(imageId: string, userId: string): Promise<void> {
    const { data: imageData, error: fetchError } = await supabase
      .from('image_uploads')
      .select('session_id, user_id')
      .eq('id', imageId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !imageData) {
      throw createError('Image analysis not found or access denied', 404);
    }

    const { error: deleteError } = await supabase
      .from('image_uploads')
      .delete()
      .eq('id', imageId)
      .eq('user_id', userId);

    if (deleteError) {
      throw createError('Failed to delete image analysis', 500);
    }

    const { error: sessionDeleteError } = await supabase
      .from('study_sessions')
      .delete()
      .eq('id', imageData.session_id)
      .eq('user_id', userId);

    if (sessionDeleteError) {
      console.error('Failed to delete associated session:', sessionDeleteError);
    }
  }
}

