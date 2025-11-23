import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';

export const requestLogger = morgan('combined', {
  skip: (req: Request) => req.path === '/health',
});

export const apiLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
    };
    
    if (res.statusCode >= 400) {
      console.error('API Error:', logData);
    } else {
      console.log('API Request:', logData);
    }
  });
  
  next();
};

