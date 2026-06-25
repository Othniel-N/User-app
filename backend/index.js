require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const client = require('prom-client');

// ── Prometheus Metrics ───────────────────────────────────────────────
const register = new client.Registry();

// Collect default Node.js metrics (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ register });

// 1. HTTP Request Counter — counts every request by method, route, status
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// 2. HTTP Request Duration Histogram — measures latency per route
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

// 3. HTTP Error Counter — counts 4xx and 5xx responses
const httpErrorCounter = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (4xx and 5xx)',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// 4. Active Requests Gauge — how many requests are in-flight right now
const activeRequests = new client.Gauge({
  name: 'http_active_requests',
  help: 'Number of active HTTP requests being processed',
  registers: [register],
});

// 5. DB Query Duration Histogram
const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// 6. Total users gauge — business metric
const totalUsersGauge = new client.Gauge({
  name: 'app_total_users',
  help: 'Total number of users in the database',
  registers: [register],
});

// Middleware: track every request
function metricsMiddleware(req, res, next) {
  // Skip the /metrics endpoint itself
  if (req.path === '/metrics') return next();

  const start = Date.now();
  activeRequests.inc();

  res.on('finish', () => {
    const route   = req.route?.path || req.path;
    const method  = req.method;
    const status  = String(res.statusCode);
    const seconds = (Date.now() - start) / 1000;

    httpRequestCounter.inc({ method, route, status_code: status });
    httpRequestDuration.observe({ method, route, status_code: status }, seconds);
    activeRequests.dec();

    if (res.statusCode >= 400) {
      httpErrorCounter.inc({ method, route, status_code: status });
    }
  });

  next();
}

// Helper: wrap a DB query and record its duration
async function timedQuery(operation, queryFn) {
  const end = dbQueryDuration.startTimer({ operation });
  try {
    return await queryFn();
  } finally {
    end();
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

// ── DB ──────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'userapp',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      email      VARCHAR(150) UNIQUE NOT NULL,
      role       VARCHAR(50)  DEFAULT 'Member',
      avatar_url TEXT,
      created_at TIMESTAMPTZ  DEFAULT NOW()
    );
  `);
  console.log('✅ DB ready');
}

// ── Middleware ───────────────────────────────────────────────────────
//app.use(cors());
app.use(cors({
  origin: [
    'http://devops-assignment-alb-443631284.ap-south-1.elb.amazonaws.com',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(metricsMiddleware);   // ← metrics tracking on all routes

// Serve uploaded avatars
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Routes ───────────────────────────────────────────────────────────

// Prometheus scrape endpoint — Grafana/Prometheus reads this
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// GET all users
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await timedQuery('select_users', () =>
      pool.query('SELECT * FROM users ORDER BY created_at DESC')
    );
    totalUsersGauge.set(rows.length);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create user (with optional avatar upload)
app.post('/api/users', upload.single('avatar'), async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    const avatar_url = req.file
      ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
      : null;

    const { rows } = await timedQuery('insert_user', () =>
      pool.query(
        'INSERT INTO users (name, email, role, avatar_url) VALUES ($1,$2,$3,$4) RETURNING *',
        [name, email, role || 'Member', avatar_url]
      )
    );

    // Keep user gauge up to date
    const count = await pool.query('SELECT COUNT(*) FROM users');
    totalUsersGauge.set(parseInt(count.rows[0].count, 10));

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE user
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await timedQuery('delete_user', () =>
      pool.query('DELETE FROM users WHERE id=$1 RETURNING *', [id])
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    // Remove avatar file if exists
    if (rows[0].avatar_url) {
      const file = path.join(UPLOAD_DIR, path.basename(rows[0].avatar_url));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    const count = await pool.query('SELECT COUNT(*) FROM users');
    totalUsersGauge.set(parseInt(count.rows[0].count, 10));

    res.json({ message: 'Deleted', user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));
});
