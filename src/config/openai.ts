import OpenAI from 'openai';
import { config } from './env';

export const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

