import express from 'express';
import * as queries from '../database/queries-postgres.js';
import { buildFullBackupZip } from '../utils/zip.js';
import { requireRole } from '../middleware/auth.js';
import { rescheduleFromSettings } from '../scheduler/backupScheduler.js';

const router = express.Router();

const DEFAULT_RETENTION = 10;

// POST /api/backups/run — gera um backup agora (manual)
router.post('/run', requireRole('superadm'), async (req, res) => {
  try {
    const zip = await buildFullBackupZip();
    const backup = await queries.createBackup({ kind: 'manual', data: zip });
    res.status(201).json(backup);
  } catch (error) {
    console.error('❌ Erro ao gerar backup:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/backups — lista (sem os bytes)
router.get('/', requireRole('superadm'), async (req, res) => {
  try {
    res.json(await queries.listBackups());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/backups/:id/download
router.get('/:id/download', requireRole('superadm'), async (req, res) => {
  try {
    const row = await queries.getBackupData(req.params.id);
    if (!row) return res.status(404).json({ error: 'Backup não encontrado' });
    const filename = `inspec360_backup_${req.params.id.slice(0, 8)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(row.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/backups/:id
router.delete('/:id', requireRole('superadm'), async (req, res) => {
  try {
    await queries.deleteBackup(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/backups/schedule — configuração do agendamento automático
router.get('/schedule/config', requireRole('superadm'), async (req, res) => {
  try {
    const config = (await queries.getSetting('backupSchedule')) || { enabled: false, intervalHours: 24, retentionCount: DEFAULT_RETENTION };
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/backups/schedule — liga/desliga e configura o agendamento
router.put('/schedule/config', requireRole('superadm'), async (req, res) => {
  try {
    const { enabled, intervalHours, retentionCount } = req.body;
    const config = {
      enabled: Boolean(enabled),
      intervalHours: Number(intervalHours) || 24,
      retentionCount: Number(retentionCount) || DEFAULT_RETENTION,
    };
    await queries.setSetting('backupSchedule', config);
    await rescheduleFromSettings(config);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
