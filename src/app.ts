import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth.routes.js';
import transferRoutes from './routes/transfer.routes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { logger } from './utils/logger.js';
import { swaggerSpec } from './config/swagger.js';

export function createApp(): Express {
  const app = express();

  // Relax helmet for Swagger UI (it uses inline scripts)
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
      stream: { write: (msg: string) => logger.info(msg.trim()) },
    }),
  );

  // Swagger docs
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'vival-digital',
      timestamp: new Date().toISOString(),
    });
  });

  // Feature routes
  app.use('/api/auth', authRoutes);
  app.use('/api/transfer', transferRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}