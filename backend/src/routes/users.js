import express from 'express';
import bcrypt from 'bcryptjs';
import * as queries from '../database/queries-postgres.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users - Obter todos os usuários (sem o hash da senha)
router.get('/', async (req, res) => {
  try {
    const users = await queries.getAllUsers();
    res.json(users.map(({ passwordHash, ...u }) => u));
  } catch (error) {
    console.error('❌ Erro ao buscar usuários:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:id - Obter usuário por ID
router.get('/:id', async (req, res) => {
  try {
    const user = await queries.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const { passwordHash, ...rest } = user;
    res.json(rest);
  } catch (error) {
    console.error('❌ Erro ao buscar usuário:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users - Criar novo usuário (somente admin)
router.post('/', requireRole('superadm'), async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Senha obrigatória (mínimo 6 caracteres)' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await queries.createUser({ ...rest, passwordHash });
    const { passwordHash: _omit, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/:id - Atualizar usuário
router.put('/:id', async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const updates = { ...rest };
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
      updates.passwordHash = await bcrypt.hash(password, 10);
    }
    const user = await queries.updateUser(req.params.id, updates);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('❌ Erro ao atualizar usuário:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/users/:id - Excluir usuário (somente admin)
router.delete('/:id', requireRole('superadm'), async (req, res) => {
  try {
    await queries.deleteUser(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('❌ Erro ao excluir usuário:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
