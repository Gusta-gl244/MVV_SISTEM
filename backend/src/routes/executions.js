import express from 'express';
import * as queries from '../database/queries-postgres.js';

const router = express.Router();

// GET /api/executions - Obter todas as execuções
router.get('/', async (req, res) => {
  try {
    const executions = await queries.getAllExecutions();
    res.json(executions);
  } catch (error) {
    console.error('❌ Erro ao buscar execuções:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/executions/:id - Obter execução por ID
router.get('/:id', async (req, res) => {
  try {
    const execution = await queries.getExecutionById(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: 'Execução não encontrada' });
    }
    res.json(execution);
  } catch (error) {
    console.error('❌ Erro ao buscar execução:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/executions - Criar nova execução
router.post('/', async (req, res) => {
  try {
    const execution = await queries.createExecution(req.body);
    res.status(201).json(execution);
  } catch (error) {
    console.error('❌ Erro ao criar execução:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/executions/:id - Atualizar execução
router.put('/:id', async (req, res) => {
  try {
    const execution = await queries.updateExecution(req.params.id, req.body);
    if (!execution) {
      return res.status(404).json({ error: 'Execução não encontrada' });
    }
    res.json(execution);
  } catch (error) {
    console.error('❌ Erro ao atualizar execução:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/executions/:id
router.delete('/:id', async (req, res) => {
  try {
    await queries.deleteExecution(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('❌ Erro ao excluir execução:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
