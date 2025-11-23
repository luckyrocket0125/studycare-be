import { supabase } from '../config/database';
import { OpenAIService } from './openai.service';
import { StorageService } from './storage.service';
import { createError } from '../middleware/error.middleware';

export interface ImageAnalysisResult {
  ocrText: string;
  explanation: string;
  imageUrl: string;
  sessionId: string;
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
    };
  }
}

