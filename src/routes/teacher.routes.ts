import express from 'express';
import { TeacherService } from '../services/teacher.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { roleMiddleware } from '../middleware/role.middleware';

const router = express.Router();
const teacherService = new TeacherService();

router.use(authMiddleware);
router.use(roleMiddleware(['teacher']));

router.post('/classes', async (req: AuthRequest, res, next) => {
  try {
    const { name, subject } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { message: 'Class name is required' },
      });
    }

    const classData = await teacherService.createClass(req.user!.id, name, subject);
    res.json({
      success: true,
      data: classData,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/classes', async (req: AuthRequest, res, next) => {
  try {
    const classes = await teacherService.getClasses(req.user!.id);
    res.json({
      success: true,
      data: classes,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/classes/:id/students', async (req: AuthRequest, res, next) => {
  try {
    const students = await teacherService.getClassStudents(req.params.id, req.user!.id);
    res.json({
      success: true,
      data: students,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/classes/:id/stats', async (req: AuthRequest, res, next) => {
  try {
    const stats = await teacherService.getClassActivityStats(req.params.id, req.user!.id);
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

