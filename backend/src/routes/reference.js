import express from 'express';
import * as queries from '../database/queries-postgres.js';

const router = express.Router();

// GET /api/reference/splices — pontos de emenda de condutor (dado real da linha)
router.get('/splices', async (req, res) => {
  try {
    res.json(await queries.getAllSplices());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reference/line-info — dados gerais da linha (tag, tensão, condutor, etc.)
router.get('/line-info', async (req, res) => {
  try {
    res.json((await queries.getSetting('lineInfo')) || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reference/severities
router.get('/severities', async (req, res) => {
  try {
    res.json(await queries.getAllSeverities());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
