import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initDb, closeDb } from './database/postgres-connection.js';
import { initializeDatabase } from './database/init-postgres.js';
import { seedTestAccountsIfEmpty } from './database/seed.js';
import { initBackupScheduler } from './scheduler/backupScheduler.js';
import { requireAuth } from './middleware/auth.js';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import structuresRouter from './routes/structures.js';
import componentsRouter from './routes/components.js';
import serviceOrdersRouter from './routes/serviceOrders.js';
import inspectionsRouter from './routes/inspections.js';
import executionsRouter from './routes/executions.js';
import syncRouter from './routes/sync.js';
import backupsRouter from './routes/backups.js';
import referenceRouter from './routes/reference.js';
import diagnosticsRouter from './routes/diagnostics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

const distPath = path.join(__dirname, '../../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS PÚBLICAS (sem autenticação)
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'postgresql', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS AUTENTICADAS
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/users', requireAuth, usersRouter);
app.use('/api/structures', requireAuth, structuresRouter);
app.use('/api/components', requireAuth, componentsRouter);
app.use('/api/service-orders', requireAuth, serviceOrdersRouter);
app.use('/api/inspections', requireAuth, inspectionsRouter);
app.use('/api/executions', requireAuth, executionsRouter);
app.use('/api/sync', requireAuth, syncRouter);
app.use('/api/backups', requireAuth, backupsRouter);
app.use('/api/reference', requireAuth, referenceRouter);
app.use('/api/diagnostics', requireAuth, diagnosticsRouter);

// ─────────────────────────────────────────────────────────────────────────────
// SPA FALLBACK
// ─────────────────────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../../dist/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built. Run: npm run build' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

async function startServer() {
  try {
    if (!process.env.DATABASE_URL) {
      const { ensureLocalDatabase } = await import('./database/dev-bootstrap.js');
      await ensureLocalDatabase();
    }

    console.log('🔧 Inicializando banco de dados PostgreSQL...');
    await initDb();
    await initializeDatabase();
    await seedTestAccountsIfEmpty();
    await initBackupScheduler();
    console.log('✅ Banco de dados inicializado com sucesso!');

    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║          🚀 INSPEC360 — Backend Operacional                 ║
╚════════════════════════════════════════════════════════════╝

📡 Servidor em: http://localhost:${PORT}
🔧 API em: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/api/health

Pressione Ctrl+C para parar
      `);
    });
  } catch (error) {
    console.error('❌ ERRO ao iniciar servidor:', error.message);
    console.error('📝 Stack:', error.stack);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('\n📴 Encerrando servidor...');
  const { stopLocalDatabase } = await import('./database/dev-bootstrap.js');
  await stopLocalDatabase().catch(() => {});
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📴 Encerrando servidor...');
  const { stopLocalDatabase } = await import('./database/dev-bootstrap.js');
  await stopLocalDatabase().catch(() => {});
  closeDb();
  process.exit(0);
});
