import express from 'express';
import { SymptomService } from '../services/symptom.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { SymptomCheckDto } from '../types/symptom.types';

const router = express.Router();
const symptomService = new SymptomService();

router.use(authMiddleware);

router.post('/check', async (req: AuthRequest, res, next) => {
  try {
    const symptomData: SymptomCheckDto = req.body;

    if (!symptomData.symptoms || symptomData.symptoms.trim().length === 0) {
      return res.status(400).json({
        error: { message: 'Symptoms description is required' },
      });
    }

    const guidance = await symptomService.checkSymptoms(req.user!.id, symptomData);
    res.json({
      success: true,
      data: guidance,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/history', async (req: AuthRequest, res, next) => {
  try {
    const history = await symptomService.getSymptomHistory(req.user!.id);
    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

