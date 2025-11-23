import express from 'express';
import multer from 'multer';
import { VoiceService } from '../services/voice.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const router = express.Router();
const voiceService = new VoiceService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|webm|ogg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  },
});

router.use(authMiddleware);

router.post('/transcribe', upload.single('audio'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { message: 'No audio file provided' },
      });
    }

    const sessionId = req.body.sessionId;
    const result = await voiceService.transcribeAudio(
      req.user!.id,
      req.file.buffer,
      req.file.originalname,
      sessionId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/synthesize', async (req: AuthRequest, res, next) => {
  try {
    const { text, language, sessionId } = req.body;

    if (!text) {
      return res.status(400).json({
        error: { message: 'Text is required' },
      });
    }

    const result = await voiceService.synthesizeSpeech(
      req.user!.id,
      text,
      language || 'en',
      sessionId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/chat', upload.single('audio'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { message: 'No audio file provided' },
      });
    }

    const { language, sessionId } = req.body;
    const result = await voiceService.voiceChat(
      req.user!.id,
      req.file.buffer,
      req.file.originalname,
      language || req.user!.language_preference || 'en',
      sessionId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

