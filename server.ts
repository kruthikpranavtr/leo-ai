import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import chatRouter from './routes/chat.js';
import { initDb } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes FIRST
app.use('/api', chatRouter);

// System Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'J.A.R.V.I.S. Core',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Serve static frontend files from 'public' directory
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Fallback to public/index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start Server
async function start() {
  try {
    await initDb();
    console.log('[JARVIS DB] SQLite database initialized successfully.');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[JARVIS SERVER] Running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[JARVIS ERROR] Failed to start server:', error);
    process.exit(1);
  }
}

start();
