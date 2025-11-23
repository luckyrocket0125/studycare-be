import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database';
import { createError } from './error.middleware';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    language_preference?: string;
    simplified_mode?: boolean;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError('No authorization token provided', 401);
    }

    const token = authHeader.substring(7);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw createError('Invalid or expired token', 401);
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      throw createError('User not found', 404);
    }

    req.user = {
      id: userData.id,
      email: userData.email,
      role: userData.role,
      language_preference: userData.language_preference,
      simplified_mode: userData.simplified_mode,
    };

    next();
  } catch (error: any) {
    if (error.statusCode) {
      return next(error);
    }
    next(createError('Authentication failed', 401));
  }
};

