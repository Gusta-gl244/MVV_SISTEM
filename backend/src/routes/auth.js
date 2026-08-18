import express from 'express';
import bcrypt from 'bcryptjs';
import * as queries from '../database/queries-postgres.js';
import { signToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login — único endpoint de login do sistema
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    const user = await queries.getUserByEmail(String(email).toLowerCase());
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'E-mail ou senha inválidos' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos' });
    }

    await queries.updateUser(user.id, { lastLogin: new Date().toISOString() });
    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('❌ Erro no login:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
