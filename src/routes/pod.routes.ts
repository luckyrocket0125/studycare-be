import express from 'express';
import { PodService } from '../services/pod.services';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { CreatePodDto } from '../types/pod.types';

const router = express.Router();
const podService = new PodService();

router.use(authMiddleware);

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const podData: CreatePodDto = req.body;

    if (!podData.name) {
      return res.status(400).json({
        error: { message: 'Pod name is required' },
      });
    }

    const pod = await podService.createPod(req.user!.id, podData);
    res.status(201).json({
      success: true,
      data: pod,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const pods = await podService.getPods(req.user!.id);
    res.json({
      success: true,
      data: pods,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const pod = await podService.getPod(req.params.id, req.user!.id);
    res.json({
      success: true,
      data: pod,
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/:id/join', async (req: AuthRequest, res, next) => {
  try {
    const member = await podService.joinPod(req.params.id, req.user!.id);
    res.json({
      success: true,
      data: member,
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/:id/leave', async (req: AuthRequest, res, next) => {
  try {
    await podService.leavePod(req.params.id, req.user!.id);
    res.json({
      success: true,
      message: 'Left pod successfully',
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/:id/messages', async (req: AuthRequest, res, next) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        error: { message: 'Message content is required' },
      });
    }

    const message = await podService.sendMessage(req.params.id, req.user!.id, content);
    res.json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/:id/messages', async (req: AuthRequest, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const messages = await podService.getMessages(req.params.id, limit);
    res.json({
      success: true,
      data: messages,
    });
  } catch (error: any) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await podService.deletePod(req.params.id, req.user!.id);
    res.json({
      success: true,
      message: 'Pod deleted successfully',
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

