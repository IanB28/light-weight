import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { estimateOneRm } from '@light-weight/domain';
import { testDbConnection } from './db/index.js';
import { exerciseRouter } from './routes/exercises.js';
import { syncRouter } from './routes/sync.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Verificación de salud de API y conexión a PostgreSQL (Neon)
app.get('/api/health', async (_req, res) => {
  const dbStatus = await testDbConnection();
  res.json({
    status: 'ok',
    app: 'light-weight-api',
    uptime: process.uptime(),
    database: dbStatus.ok ? 'connected' : 'error',
    dbDetails: dbStatus.message || 'Neon PostgreSQL healthy',
    timestamp: new Date().toISOString()
  });
});

// Rutas de datos
app.use('/api/exercises', exerciseRouter);
app.use('/api/sync', syncRouter);

app.get('/api/demo/onerm', (req, res) => {
  const weight = Number(req.query.weight) || 100;
  const reps = Number(req.query.reps) || 5;
  const estimate = estimateOneRm(weight, reps);
  res.json({ weight, reps, estimate });
});

app.listen(port, () => {
  console.log(`[light-weight-api] Running on http://localhost:${port}`);
});
