import express from 'express';
import * as queries from '../database/queries-postgres.js';

const router = express.Router();

const ENTITIES = ['users', 'structures', 'componentRules', 'severities', 'serviceOrders', 'inspectionRecords', 'executionRecords'];

// GET /api/sync/pull?since=<ISO> — tudo que mudou (ou tudo, na primeira vez)
router.get('/pull', async (req, res) => {
  try {
    const since = req.query.since || null;
    const serverTime = new Date().toISOString();

    const data = {};
    const deleted = {};
    for (const entity of ENTITIES) {
      data[entity] = await queries.getUpdatedSince(entity, since);
      deleted[entity] = await queries.getDeletedSince(entity, since);
    }

    res.json({ serverTime, since, data, deleted });
  } catch (error) {
    console.error('❌ Erro no pull de sincronização:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sync/push — { mutations: [{ entity, op, id, payload, clientUpdatedAt, deviceId }] }
router.post('/push', async (req, res) => {
  try {
    const { mutations } = req.body;
    if (!Array.isArray(mutations)) {
      return res.status(400).json({ error: 'mutations deve ser um array' });
    }

    const results = [];
    for (const m of mutations) {
      try {
        if (!ENTITIES.includes(m.entity)) {
          results.push({ clientOpId: m.clientOpId, status: 'error', error: `Entidade desconhecida: ${m.entity}` });
          continue;
        }

        if (m.op === 'delete') {
          const record = await queries.softDelete(m.entity, m.id);
          results.push({ clientOpId: m.clientOpId, status: 'ok', record });
        } else {
          const { conflict, record } = await queries.upsertLWW(m.entity, m.id, m.payload, m.clientUpdatedAt, m.deviceId);
          results.push({ clientOpId: m.clientOpId, status: conflict ? 'conflict' : 'ok', record });
        }
      } catch (err) {
        console.error(`❌ Erro aplicando mutação (${m.entity}/${m.id}):`, err.message);
        results.push({ clientOpId: m.clientOpId, status: 'error', error: err.message });
      }
    }

    res.json({ results, serverTime: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Erro no push de sincronização:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
