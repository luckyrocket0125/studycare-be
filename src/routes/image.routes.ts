import express from 'express';
import multer from 'multer';
import { OCRService } from '../services/ocr.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const router = express.Router();
const ocrService = new OCRService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});

router.post('/upload', authMiddleware, upload.single('image'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { message: 'No image file provided' },
      });
    }

    const result = await ocrService.uploadAndAnalyze(
      req.user!.id,
      req.file.buffer,
      req.file.originalname
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/:sessionId', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const result = await ocrService.getImageAnalysis(req.params.sessionId, req.user!.id);
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

