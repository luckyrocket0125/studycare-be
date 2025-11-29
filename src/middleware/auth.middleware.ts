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

    let { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      console.warn('User lookup failed in authMiddleware, attempting to create profile:', {
        userId: user.id,
        email: user.email,
        error: userError,
      });

      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_user_profile', {
          p_id: user.id,
          p_email: user.email || '',
          p_full_name: user.user_metadata?.full_name || null,
          p_role: user.user_metadata?.role || 'student',
          p_language_preference: user.user_metadata?.language_preference || 'en',
          p_simplified_mode: false,
        });

        if (rpcError) {
          console.error('Failed to create user profile via RPC:', rpcError);
          
          if (rpcError.code === '23505' || rpcError.message?.includes('duplicate') || rpcError.message?.includes('already exists')) {
            const { data: retryData, error: retryError } = await supabase
              .from('users')
              .select('*')
              .eq('id', user.id)
              .single();

            if (!retryError && retryData) {
              userData = retryData;
              userError = null;
            } else {
              throw createError('User profile exists but could not be retrieved. Please contact support.', 500);
            }
          } else {
            throw createError('Failed to create user profile. Please contact support.', 500);
          }
        } else if (rpcData) {
          const { data: verifyData, error: verifyError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

          if (!verifyError && verifyData) {
            userData = verifyData;
            userError = null;
          } else {
            console.error('Profile created but verification failed:', verifyError);
            throw createError('User profile was created but could not be verified. Please try again.', 500);
          }
        } else {
          throw createError('Failed to create user profile. Please contact support.', 500);
        }
      } catch (error: any) {
        if (error.statusCode) {
          throw error;
        }
        console.error('Error in authMiddleware user creation:', error);
        throw createError('User not found. Please ensure your account was created properly.', 404);
      }
    }

    if (!userData) {
      throw createError('User not found. Please ensure your account was created properly.', 404);
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

