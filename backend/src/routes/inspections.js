import express from 'express';
import * as queries from '../database/queries-postgres.js';

const router = express.Router();

// GET /api/inspections - Obter todas as inspeções
router.get('/', async (req, res) => {
  try {
    res.json(await queries.getAllInspections());
  } catch (error) {
    console.error('❌ Erro ao buscar inspeções:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inspections/:id - Obter inspeção por ID
router.get('/:id', async (req, res) => {
  try {
    const inspection = await queries.getInspectionById(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'Inspeção não encontrada' });
    res.json(inspection);
  } catch (error) {
    console.error('❌ Erro ao buscar inspeção:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inspections - Criar nova inspeção (components/historicoPausas já vêm prontos no payload)
router.post('/', async (req, res) => {
  try {
    const inspection = await queries.createInspection(req.body);
    res.status(201).json(inspection);
  } catch (error) {
    console.error('❌ Erro ao criar inspeção:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/inspections/:id - Atualizar inspeção
router.put('/:id', async (req, res) => {
  try {
    const inspection = await queries.updateInspection(req.params.id, req.body);
    if (!inspection) return res.status(404).json({ error: 'Inspeção não encontrada' });
    res.json(inspection);
  } catch (error) {
    console.error('❌ Erro ao atualizar inspeção:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/inspections/:id
router.delete('/:id', async (req, res) => {
  try {
    await queries.deleteInspection(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('❌ Erro ao excluir inspeção:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
