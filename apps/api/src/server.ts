import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { estimateOneRm } from '@light-weight/domain';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'light-weight-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/demo/onerm', (req, res) => {
  const weight = Number(req.query.weight) || 100;
  const reps = Number(req.query.reps) || 5;
  const estimate = estimateOneRm(weight, reps);
  res.json({ weight, reps, estimate });
});

app.listen(port, () => {
  console.log(`[light-weight-api] Running on http://localhost:${port}`);
});
