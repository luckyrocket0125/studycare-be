import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger, apiLogger } from './middleware/logger.middleware';
import { generalRateLimiter, authRateLimiter, apiRateLimiter } from './middleware/rateLimit.middleware';
import { metricsMiddleware, metrics } from './utils/metrics';
import authRoutes from './routes/auth.routes';
import chatRoutes from './routes/chat.routes';
import imageRoutes from './routes/image.routes';
import teacherRoutes from './routes/teacher.routes';
import studentRoutes from './routes/student.routes';
import voiceRoutes from './routes/voice.routes';
import podRoutes from './routes/pod.routes';
import noteRoutes from './routes/note.routes';
import symptomRoutes from './routes/symptom.routes';
import caregiverRoutes from './routes/caregiver.routes';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestLogger);
app.use(apiLogger);
app.use(metricsMiddleware);
app.use(generalRateLimiter);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'StudyCare AI API is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/metrics', (req, res) => {
  const metricsData = metrics.getMetrics();
  res.json({
    success: true,
    data: metricsData
  });
});

app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/chat', apiRateLimiter, chatRoutes);
app.use('/api/image', apiRateLimiter, imageRoutes);
app.use('/api/teacher', apiRateLimiter, teacherRoutes);
app.use('/api/student', apiRateLimiter, studentRoutes);
app.use('/api/voice', apiRateLimiter, voiceRoutes);
app.use('/api/pods', apiRateLimiter, podRoutes);
app.use('/api/notes', apiRateLimiter, noteRoutes);
app.use('/api/symptom', apiRateLimiter, symptomRoutes);
app.use('/api/caregiver', apiRateLimiter, caregiverRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 StudyCare AI API running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

