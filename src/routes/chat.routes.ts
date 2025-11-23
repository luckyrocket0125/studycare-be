import express from 'express';
import { ChatService } from '../services/chat.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { CreateSessionDto, SendMessageDto } from '../types/chat.types';

const router = express.Router();
const chatService = new ChatService();

router.post('/session', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const sessionData: CreateSessionDto = req.body;
    const session = await chatService.createSession(req.user!.id, sessionData);
    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/message', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const messageData: SendMessageDto = req.body;
    
    if (!messageData.sessionId || !messageData.message) {
      return res.status(400).json({
        error: { message: 'sessionId and message are required' },
      });
    }

    const result = await chatService.sendMessage(
      messageData.sessionId,
      req.user!.id,
      {
        sessionId: messageData.sessionId,
        message: messageData.message,
        language: messageData.language || req.user!.language_preference || 'en',
      }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/session/:id', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const session = await chatService.getSession(req.params.id, req.user!.id);
    const messages = await chatService.getMessageHistory(req.params.id);
    
    res.json({
      success: true,
      data: {
        session,
        messages,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/sessions', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const sessions = await chatService.getSessions(req.user!.id);
    res.json({
      success: true,
      data: sessions,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

