import express from 'express';
import { NoteService } from '../services/note.service';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { CreateNoteDto, UpdateNoteDto } from '../types/note.types';

const router = express.Router();
const noteService = new NoteService();

router.use(authMiddleware);

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const noteData: CreateNoteDto = req.body;

    if (!noteData.title || !noteData.content) {
      return res.status(400).json({
        error: { message: 'Title and content are required' },
      });
    }

    const note = await noteService.createNote(req.user!.id, noteData);
    res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const notes = await noteService.getNotes(req.user!.id);
    res.json({
      success: true,
      data: notes,
    });
  } catch (error: any) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const note = await noteService.getNote(req.params.id, req.user!.id);
    res.json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const updateData: UpdateNoteDto = req.body;
    const note = await noteService.updateNote(req.params.id, req.user!.id, updateData);
    res.json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await noteService.deleteNote(req.params.id, req.user!.id);
    res.json({
      success: true,
      message: 'Note deleted successfully',
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/:id/summarize', async (req: AuthRequest, res, next) => {
  try {
    const summary = await noteService.summarizeNote(req.params.id, req.user!.id);
    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/:id/explain', async (req: AuthRequest, res, next) => {
  try {
    const explanation = await noteService.explainNote(req.params.id, req.user!.id);
    res.json({
      success: true,
      data: explanation,
    });
  } catch (error: any) {
    next(error);
  }
});

router.post('/:id/organize', async (req: AuthRequest, res, next) => {
  try {
    const note = await noteService.organizeNote(req.params.id, req.user!.id);
    res.json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

