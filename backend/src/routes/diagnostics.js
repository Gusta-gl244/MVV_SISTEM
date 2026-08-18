import express from 'express';
import { getQuery } from '../database/postgres-connection.js';
import * as queries from '../database/queries-postgres.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

const TABLES = {
  users: 'users', structures: 'structures', componentRules: '"componentRules"',
  severities: 'severities', serviceOrders: '"serviceOrders"',
  inspectionRecords: '"inspectionRecords"', executionRecords: '"executionRecords"',
  splices: 'splices', backups: 'backups',
};

// GET /api/diagnostics — estado real do banco/sincronização/backup, para o
// painel "Status" do admin. Nada aqui é estimado ou fixo — cada número vem
// de uma consulta ao banco no momento da chamada.
router.get('/', requireRole('superadm'), async (req, res) => {
  try {
    const counts = {};
    for (const [key, table] of Object.entries(TABLES)) {
      const hasDeletedAt = key !== 'backups';
      const where = hasDeletedAt ? ' WHERE "deletedAt" IS NULL' : '';
      const rows = await getQuery(`SELECT COUNT(*)::int AS n FROM ${table}${where}`);
      counts[key] = rows[0].n;
    }

    const backupSchedule = (await queries.getSetting('backupSchedule')) || { enabled: false };
    const backups = await queries.listBackups();
    const lastBackup = backups[0] || null;

    res.json({
      database: { connected: true, driver: 'postgresql' },
      server: { uptimeSeconds: Math.round(process.uptime()), nodeVersion: process.version },
      counts,
      backupSchedule,
      lastBackup,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ database: { connected: false }, error: error.message });
  }
});

export default router;
