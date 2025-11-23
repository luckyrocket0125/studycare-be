import { supabase } from '../config/database';
import { CreateUserDto, User, LoginDto } from '../types/user.types';
import { createError } from '../middleware/error.middleware';

export class AuthService {
  async register(userData: CreateUserDto): Promise<{ user: User; token: string }> {
    const { email, password, full_name, role, language_preference } = userData;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData.user) {
      throw createError(authError?.message || 'Registration failed', 400);
    }

    let user: User | null = null;
    let userError: any = null;

    try {
      const { data: userData, error: insertError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          full_name: full_name || null,
          role,
          language_preference: language_preference || 'en',
          simplified_mode: false,
        })
        .select()
        .single();

      user = userData;
      userError = insertError;
    } catch (error) {
      userError = error;
    }

    if (userError || !user) {
      try {
        const { data: userData, error: rpcError } = await supabase.rpc('create_user_profile', {
          p_id: authData.user.id,
          p_email: email,
          p_full_name: full_name || null,
          p_role: role,
          p_language_preference: language_preference || 'en',
          p_simplified_mode: false,
        });

        if (rpcError || !userData) {
          throw rpcError || new Error('RPC call failed');
        }

        user = userData as User;
        userError = null;
      } catch (rpcError) {
        console.error('User creation error (both methods failed):', userError, rpcError);
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw createError(
          userError?.message || 'Failed to create user profile. Please check database permissions.',
          500
        );
      }
    }

    let session = authData.session;

    if (!session) {
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        authData.user.id,
        { email_confirm: true }
      );

      if (updateError) {
        console.error('Failed to confirm user email:', updateError);
      }

      const { data: { session: newSession }, error: sessionError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (sessionError || !newSession) {
        console.error('Session creation error:', sessionError);
        const errorMessage = sessionError?.message || 'Failed to create session';
        throw createError(errorMessage, 500);
      }
      
      session = newSession;
    }

    return {
      user,
      token: session.access_token,
    };
  }

  async login(credentials: LoginDto): Promise<{ user: User; token: string }> {
    const { email, password } = credentials;

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.session) {
      throw createError('Invalid email or password', 401);
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !user) {
      throw createError('User not found', 404);
    }

    return {
      user,
      token: authData.session.access_token,
    };
  }

  async getProfile(userId: string): Promise<User> {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw createError('User not found', 404);
    }

    return user;
  }

  async updateProfile(userId: string, updates: Partial<User>): Promise<User> {
    const { data: user, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error || !user) {
      throw createError('Failed to update profile', 500);
    }

    return user;
  }
}

