import { createClient } from '@supabase/supabase-js';
import { config } from './env';

const supabaseOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-client-info': 'studycare-backend',
    },
  },
};

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  supabaseOptions
);

export const supabaseAnon = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  supabaseOptions
);
