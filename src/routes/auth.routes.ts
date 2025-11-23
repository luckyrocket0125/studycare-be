import express from 'express';
import { AuthService } from '../services/auth.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { CreateUserDto, LoginDto } from '../types/user.types';

const router = express.Router();
const authService = new AuthService();

router.post('/register', async (req, res, next) => {
  try {
    const userData: CreateUserDto = req.body;
    
    if (!userData.email || !userData.password || !userData.role) {
      return res.status(400).json({
        error: { message: 'Email, password, and role are required' },
      });
    }

    const result = await authService.register(userData);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const credentials: LoginDto = req.body;
    
    if (!credentials.email || !credentials.password) {
      return res.status(400).json({
        error: { message: 'Email and password are required' },
      });
    }

    const result = await authService.login(credentials);
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/profile', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const user = await authService.getProfile(req.user!.id);
    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    next(error);
  }
});

router.put('/profile', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const updates = req.body;
    const user = await authService.updateProfile(req.user!.id, updates);
    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

