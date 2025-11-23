import { supabase } from '../config/database';
import { createError } from '../middleware/error.middleware';

export class StorageService {
  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    folder: 'images' | 'audio' = 'images'
  ): Promise<string> {
    const filePath = `${folder}/${Date.now()}-${filename}`;

    const { data, error } = await supabase.storage
      .from('studycare-uploads')
      .upload(filePath, fileBuffer, {
        contentType: this.getContentType(filename),
        upsert: false,
      });

    if (error || !data) {
      throw createError(`Failed to upload file: ${error?.message}`, 500);
    }

    const { data: urlData } = supabase.storage
      .from('studycare-uploads')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  }

  async deleteFile(filePath: string): Promise<void> {
    const { error } = await supabase.storage
      .from('studycare-uploads')
      .remove([filePath]);

    if (error) {
      throw createError(`Failed to delete file: ${error.message}`, 500);
    }
  }

  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      webm: 'audio/webm',
    };

    return contentTypes[ext || ''] || 'application/octet-stream';
  }
}

