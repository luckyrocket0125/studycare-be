import express from 'express';
import { CaregiverService } from '../services/caregiver.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { roleMiddleware } from '../middleware/role.middleware';
import { LinkChildDto } from '../types/caregiver.types';

const router = express.Router();
const caregiverService = new CaregiverService();

router.use(authMiddleware);
router.use(roleMiddleware(['caregiver']));

router.post('/link-child', async (req: AuthRequest, res, next) => {
  try {
    const linkData: LinkChildDto = req.body;

    if (!linkData.childEmail) {
      return res.status(400).json({
        error: { message: 'Child email is required' },
      });
    }

    const relationship = await caregiverService.linkChild(req.user!.id, linkData);
    res.status(201).json({
      success: true,
      data: relationship,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/children', async (req: AuthRequest, res, next) => {
  try {
    const children = await caregiverService.getLinkedChildren(req.user!.id);
    res.json({
      success: true,
      data: children,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/child/:childId/activity', async (req: AuthRequest, res, next) => {
  try {
    const activity = await caregiverService.getChildActivity(req.user!.id, req.params.childId);
    res.json({
      success: true,
      data: activity,
    });
  } catch (error: any) {
    next(error);
  }
});

router.delete('/unlink/:childId', async (req: AuthRequest, res, next) => {
  try {
    await caregiverService.unlinkChild(req.user!.id, req.params.childId);
    res.json({
      success: true,
      message: 'Child unlinked successfully',
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;