import express from 'express';
import { StudentService } from '../services/student.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { roleMiddleware } from '../middleware/role.middleware';

const router = express.Router();
const studentService = new StudentService();

router.use(authMiddleware);
router.use(roleMiddleware(['student']));

router.post('/join-class', async (req: AuthRequest, res, next) => {
  try {
    const { classCode } = req.body;

    if (!classCode) {
      return res.status(400).json({
        error: { message: 'Class code is required' },
      });
    }

    const enrollment = await studentService.joinClass(req.user!.id, classCode);
    res.json({
      success: true,
      data: enrollment,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/classes', async (req: AuthRequest, res, next) => {
  try {
    const classes = await studentService.getStudentClasses(req.user!.id);
    res.json({
      success: true,
      data: classes,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

