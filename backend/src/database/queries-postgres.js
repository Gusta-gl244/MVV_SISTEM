import { runSQL, getQuery, getQueryOne } from './postgres-connection.js';
import { v4 as uuidv4 } from 'uuid';

// ═════════════════════════════════════════════════════════════════════════════
// Helpers genéricos de sincronização
//
// upsertLWW: cria ou atualiza um registro só se o timestamp recebido for
// mais novo (ou igual) que o já gravado — "last write wins" por registro,
// nunca por coleção inteira. É o núcleo que substitui a heurística antiga de
// "isso parece uma sobrescrita desatualizada?" por uma regra determinística.
// ═════════════════════════════════════════════════════════════════════════════

const TABLES = {
  users: { pk: 'id' },
  structures: { pk: 'id' },
  componentRules: { pk: 'id', quoted: '"componentRules"' },
  severities: { pk: 'id' },
  serviceOrders: { pk: 'id', quoted: '"serviceOrders"' },
  inspectionRecords: { pk: 'id', quoted: '"inspectionRecords"' },
  executionRecords: { pk: 'id', quoted: '"executionRecords"' },
};

function tableName(entity) {
  const t = TABLES[entity];
  if (!t) throw new Error(`Entidade de sincronização desconhecida: ${entity}`);
  return t.quoted || `"${entity}"`;
}

export async function getUpdatedSince(entity, since) {
  const t = tableName(entity);
  if (!since) {
    return getQuery(`SELECT * FROM ${t} WHERE "deletedAt" IS NULL ORDER BY "updatedAt" ASC`);
  }
  return getQuery(`SELECT * FROM ${t} WHERE "updatedAt" > $1 AND "deletedAt" IS NULL ORDER BY "updatedAt" ASC`, [since]);
}

export async function getDeletedSince(entity, since) {
  const t = tableName(entity);
  if (!since) return [];
  const rows = await getQuery(`SELECT id FROM ${t} WHERE "deletedAt" > $1`, [since]);
  return rows.map((r) => r.id);
}

/**
 * Upsert com last-write-wins por registro — mas "mais novo" é decidido por
 * causalidade (o registro mudou no servidor, por causa de OUTRO
 * dispositivo, desde a última vez que este dispositivo o viu?), nunca
 * comparando relógios de dispositivos entre si.
 *
 * `payload.updatedAt` é o `updatedAt` que o próprio cliente tinha gravado
 * localmente para esse registro (veio de um pull anterior). Se bater com o
 * que está no servidor agora, o cliente estava editando em cima da versão
 * mais recente que existe — aplica, mesmo que o relógio do aparelho esteja
 * atrasado.
 *
 * Se não bater mas quem gravou por último foi ESTE MESMO dispositivo, ainda
 * não é conflito — é o dispositivo aplicando a mutação seguinte da própria
 * fila offline (ex.: iniciar e concluir uma ordem offline geram duas
 * mutações para o mesmo registro; a segunda chega com o mesmo
 * payload.updatedAt "antigo" da primeira, porque nada localmente atualiza
 * esse campo entre as duas — só o servidor faz isso, na hora que aplica).
 * Só é conflito de verdade quando o servidor tem uma versão de OUTRO
 * dispositivo que este nunca chegou a ver.
 *
 * Antes disso comparava `clientUpdatedAt` (relógio do tablet) contra
 * `existing.updatedAt` (relógio do servidor) — e um tablet minutos atrasado
 * (comum em campo, sem internet pra sincronizar hora) fazia uma inspeção
 * concluída offline parecer "mais antiga" que a própria atribuição da
 * ordem, perdendo a conclusão ao sincronizar.
 */
export async function upsertLWW(entity, id, payload, clientUpdatedAt, deviceId) {
  const t = tableName(entity);
  const columns = await getColumns(entity);
  const hasDeviceIdColumn = columns.includes('deviceId');

  const existingSelect = hasDeviceIdColumn ? '"updatedAt", "deviceId"' : '"updatedAt"';
  const existing = await getQueryOne(`SELECT ${existingSelect} FROM ${t} WHERE id = $1`, [id]);

  const knownUpdatedAt = payload?.updatedAt ?? null;
  const sameDeviceAsLastWriter =
    hasDeviceIdColumn && !!existing && !!deviceId && existing.deviceId === deviceId;
  const hasConflict =
    !!existing &&
    !!knownUpdatedAt &&
    new Date(existing.updatedAt).getTime() !== new Date(knownUpdatedAt).getTime() &&
    !sameDeviceAsLastWriter;

  if (hasConflict) {
    // Servidor tem uma versão de outro dispositivo que este nunca viu — mantém a dele.
    return { conflict: true, record: await getQueryOne(`SELECT * FROM ${t} WHERE id = $1`, [id]) };
  }

  const now = new Date().toISOString();
  // "updatedAt" é sempre o relógio do servidor, nunca o do dispositivo — é
  // o cursor que outros clientes usam pra saber o que puxar (GET
  // /sync/pull?since=...); se fosse o relógio do tablet, um aparelho
  // atrasado poderia gravar um updatedAt "no passado" e essa mudança nunca
  // seria vista por ninguém que já tivesse puxado depois desse horário.
  const row = { ...payload, id, updatedAt: now, deviceId: deviceId ?? payload.deviceId ?? null, deletedAt: null };
  if (!existing) row.createdAt = row.createdAt || clientUpdatedAt || now;

  const fields = columns.filter((c) => c in row);
  const values = fields.map((f) => serializeValue(row[f]));
  const setClause = fields.map((f, i) => `"${f}" = $${i + 2}`).join(', ');
  const insertCols = fields.map((f) => `"${f}"`).join(', ');
  const insertVals = fields.map((_, i) => `$${i + 2}`).join(', ');

  await runSQL(
    `INSERT INTO ${t} (id, ${insertCols}) VALUES ($1, ${insertVals})
     ON CONFLICT (id) DO UPDATE SET ${setClause}`,
    [id, ...values]
  );

  return { conflict: false, record: await getQueryOne(`SELECT * FROM ${t} WHERE id = $1`, [id]) };
}

export async function softDelete(entity, id) {
  const t = tableName(entity);
  const now = new Date().toISOString();
  await runSQL(`UPDATE ${t} SET "deletedAt" = $1, "updatedAt" = $1 WHERE id = $2`, [now, id]);
  return { id, deletedAt: now };
}

const columnCache = new Map();
async function getColumns(entity) {
  if (columnCache.has(entity)) return columnCache.get(entity);
  const t = tableName(entity).replace(/"/g, '');
  const rows = await getQuery(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name NOT IN ('id')`,
    [t]
  );
  const cols = rows.map((r) => r.column_name);
  columnCache.set(entity, cols);
  return cols;
}

function serializeValue(v) {
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ═════════════════════════════════════════════════════════════════════════════
// USERS
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllUsers() {
  return getQuery('SELECT * FROM users WHERE "deletedAt" IS NULL ORDER BY "createdAt" ASC');
}

export async function getUserById(id) {
  return getQueryOne('SELECT * FROM users WHERE id = $1 AND "deletedAt" IS NULL', [id]);
}

export async function getUserByEmail(email) {
  return getQueryOne('SELECT * FROM users WHERE email = $1 AND "deletedAt" IS NULL', [email]);
}

export async function createUser(data) {
  const id = data.id || uuidv4();
  const now = new Date().toISOString();
  await runSQL(
    `INSERT INTO users (id, name, email, "passwordHash", role, status, phone, avatar, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [id, data.name, data.email, data.passwordHash, data.role || 'tecnico', data.status || 'active', data.phone || null, data.avatar || null, now]
  );
  return getUserById(id);
}

export async function updateUser(id, data) {
  const fields = [];
  const params = [];
  let i = 1;
  const map = { name: 'name', email: 'email', passwordHash: '"passwordHash"', role: 'role', status: 'status', phone: 'phone', avatar: 'avatar', lastLogin: '"lastLogin"' };
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) { fields.push(`${col} = $${i}`); params.push(data[key]); i++; }
  }
  fields.push(`"updatedAt" = $${i}`); params.push(new Date().toISOString()); i++;
  params.push(id);
  await runSQL(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, params);
  return getUserById(id);
}

export async function deleteUser(id) {
  return softDelete('users', id);
}

// ═════════════════════════════════════════════════════════════════════════════
// STRUCTURES
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllStructures() {
  return getQuery('SELECT * FROM structures WHERE "deletedAt" IS NULL ORDER BY name ASC');
}

export async function getStructureById(id) {
  return getQueryOne('SELECT * FROM structures WHERE id = $1 AND "deletedAt" IS NULL', [id]);
}

export async function createStructure(data) {
  const now = new Date().toISOString();
  const result = await upsertLWW('structures', data.id || uuidv4(), { ...data, createdAt: data.createdAt || now }, now, data.deviceId);
  return result.record;
}

export async function bulkCreateStructures(items) {
  const created = [];
  for (const item of items) created.push(await createStructure(item));
  return created;
}

export async function updateStructure(id, data) {
  const now = new Date().toISOString();
  const result = await upsertLWW('structures', id, data, now, data.deviceId);
  return result.record;
}

export async function deleteStructure(id) {
  return softDelete('structures', id);
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT RULES
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllComponents() {
  return getQuery('SELECT * FROM "componentRules" WHERE "deletedAt" IS NULL ORDER BY name ASC');
}

export async function getComponentById(id) {
  return getQueryOne('SELECT * FROM "componentRules" WHERE id = $1 AND "deletedAt" IS NULL', [id]);
}

export async function createComponent(data) {
  const now = new Date().toISOString();
  const result = await upsertLWW('componentRules', data.id || uuidv4(), { ...data, createdAt: now, anomalies: data.anomalies || [] }, now);
  return result.record;
}

export async function updateComponent(id, data) {
  const now = new Date().toISOString();
  const result = await upsertLWW('componentRules', id, data, now);
  return result.record;
}

export async function deleteComponent(id) {
  return softDelete('componentRules', id);
}

// ═════════════════════════════════════════════════════════════════════════════
// SEVERITIES / RISK LEVELS (mesma tabela, coluna "kind" distingue a escala)
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllSeverities() {
  return getQuery('SELECT * FROM severities WHERE "deletedAt" IS NULL ORDER BY points ASC');
}

export async function createSeverity(data) {
  const now = new Date().toISOString();
  const result = await upsertLWW('severities', data.id || uuidv4(), { ...data, createdAt: now }, now);
  return result.record;
}

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE ORDERS
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllServiceOrders() {
  return getQuery('SELECT * FROM "serviceOrders" WHERE "deletedAt" IS NULL ORDER BY "createdAt" DESC');
}

export async function getServiceOrderById(id) {
  return getQueryOne('SELECT * FROM "serviceOrders" WHERE id = $1 AND "deletedAt" IS NULL', [id]);
}

export async function createServiceOrder(data) {
  const now = new Date().toISOString();
  const result = await upsertLWW('serviceOrders', data.id || uuidv4(), { ...data, createdAt: data.createdAt || now }, now, data.deviceId);
  return result.record;
}

export async function updateServiceOrder(id, data) {
  const now = data.updatedAt || new Date().toISOString();
  const result = await upsertLWW('serviceOrders', id, data, now, data.deviceId);
  return result.record;
}

export async function deleteServiceOrder(id) {
  return softDelete('serviceOrders', id);
}

// ═════════════════════════════════════════════════════════════════════════════
// INSPECTION RECORDS
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllInspections() {
  return getQuery('SELECT * FROM "inspectionRecords" WHERE "deletedAt" IS NULL ORDER BY "dataHoraAbertura" DESC');
}

export async function getInspectionById(id) {
  return getQueryOne('SELECT * FROM "inspectionRecords" WHERE id = $1 AND "deletedAt" IS NULL', [id]);
}

export async function createInspection(data) {
  const now = new Date().toISOString();
  const result = await upsertLWW('inspectionRecords', data.id || uuidv4(), { ...data, dataHoraAbertura: data.dataHoraAbertura || now }, now, data.deviceId);
  return result.record;
}

export async function updateInspection(id, data) {
  const now = data.updatedAt || new Date().toISOString();
  const result = await upsertLWW('inspectionRecords', id, data, now, data.deviceId);
  return result.record;
}

export async function deleteInspection(id) {
  return softDelete('inspectionRecords', id);
}

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTION RECORDS
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllExecutions() {
  return getQuery('SELECT * FROM "executionRecords" WHERE "deletedAt" IS NULL ORDER BY "dataHoraAbertura" DESC');
}

export async function getExecutionById(id) {
  return getQueryOne('SELECT * FROM "executionRecords" WHERE id = $1 AND "deletedAt" IS NULL', [id]);
}

export async function createExecution(data) {
  const now = new Date().toISOString();
  const result = await upsertLWW('executionRecords', data.id || uuidv4(), { ...data, dataHoraAbertura: data.dataHoraAbertura || now }, now, data.deviceId);
  return result.record;
}

export async function updateExecution(id, data) {
  const now = data.updatedAt || new Date().toISOString();
  const result = await upsertLWW('executionRecords', id, data, now, data.deviceId);
  return result.record;
}

export async function deleteExecution(id) {
  return softDelete('executionRecords', id);
}

// ═════════════════════════════════════════════════════════════════════════════
// SPLICES (emendas)
// ═════════════════════════════════════════════════════════════════════════════

export async function getAllSplices() {
  return getQuery('SELECT * FROM splices WHERE "deletedAt" IS NULL ORDER BY "pontoEmenda" ASC, fase ASC');
}

export async function createSplice(data) {
  const id = data.id || uuidv4();
  const now = new Date().toISOString();
  await runSQL(
    `INSERT INTO splices (id, "pontoEmenda", "estruturaOrigem", "estruturaDestino", fase, tipo, descricao, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [id, data.pontoEmenda, data.estruturaOrigem, data.estruturaDestino, data.fase, data.tipo || null, data.descricao || null, now]
  );
  return getQueryOne('SELECT * FROM splices WHERE id = $1', [id]);
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═════════════════════════════════════════════════════════════════════════════

export async function getSetting(key) {
  const row = await getQueryOne('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  const now = new Date().toISOString();
  await runSQL(
    `INSERT INTO settings (key, value, "updatedAt") VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = $3`,
    [key, JSON.stringify(value), now]
  );
  return value;
}

// ═════════════════════════════════════════════════════════════════════════════
// BACKUPS
// ═════════════════════════════════════════════════════════════════════════════

export async function createBackup({ kind, data }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await runSQL(
    `INSERT INTO backups (id, "createdAt", kind, "sizeBytes", data) VALUES ($1, $2, $3, $4, $5)`,
    [id, now, kind, data.length, data]
  );
  return { id, createdAt: now, kind, sizeBytes: data.length };
}

export async function listBackups() {
  return getQuery('SELECT id, "createdAt", kind, "sizeBytes" FROM backups ORDER BY "createdAt" DESC');
}

export async function getBackupData(id) {
  return getQueryOne('SELECT data FROM backups WHERE id = $1', [id]);
}

export async function deleteBackup(id) {
  await runSQL('DELETE FROM backups WHERE id = $1', [id]);
  return true;
}

export async function pruneBackups(retentionCount) {
  const ids = await getQuery(
    'SELECT id FROM backups ORDER BY "createdAt" DESC OFFSET $1',
    [retentionCount]
  );
  for (const row of ids) await deleteBackup(row.id);
  return ids.length;
}

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM LOGS
// ═════════════════════════════════════════════════════════════════════════════

export async function addSystemLog(entry) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await runSQL(
    `INSERT INTO "systemLogs" (id, timestamp, level, module, message, "userId", "userName")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, now, entry.level, entry.module, entry.message, entry.userId || null, entry.userName || null]
  );
  return { id, timestamp: now, ...entry };
}

export async function getRecentSystemLogs(limit = 200) {
  return getQuery('SELECT * FROM "systemLogs" ORDER BY timestamp DESC LIMIT $1', [limit]);
}
