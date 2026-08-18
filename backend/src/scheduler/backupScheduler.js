import cron from 'node-cron';
import * as queries from '../database/queries-postgres.js';
import { buildFullBackupZip } from '../utils/zip.js';

let currentTask = null;

function intervalHoursToCron(hours) {
  const h = Math.max(1, Math.min(24, Math.round(hours)));
  if (h >= 24) return '0 3 * * *'; // uma vez por dia, 03:00
  return `0 */${h} * * *`;
}

async function runScheduledBackup(retentionCount) {
  try {
    console.log('🗄️  [Backup agendado] Gerando backup automático...');
    const zip = await buildFullBackupZip();
    await queries.createBackup({ kind: 'scheduled', data: zip });
    const pruned = await queries.pruneBackups(retentionCount);
    console.log(`✅ [Backup agendado] Concluído${pruned ? ` (${pruned} backup(s) antigo(s) removido(s) pela retenção)` : ''}`);
  } catch (error) {
    console.error('❌ [Backup agendado] Falhou:', error.message);
  }
}

export async function rescheduleFromSettings(config) {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (!config?.enabled) return;

  const expression = intervalHoursToCron(config.intervalHours);
  currentTask = cron.schedule(expression, () => runScheduledBackup(config.retentionCount), { scheduled: true });
  console.log(`🗄️  Backup automático agendado (${expression}, retenção de ${config.retentionCount} backups)`);
}

export async function initBackupScheduler() {
  const config = await queries.getSetting('backupSchedule');
  if (config) await rescheduleFromSettings(config);
}
