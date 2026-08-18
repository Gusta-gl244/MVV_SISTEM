import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('❌ JWT_SECRET não definida em produção — obrigatória para assinar tokens de login.');
}

// Em dev local, sem JWT_SECRET configurada, usa uma chave fixa de desenvolvimento
// (nunca aceita em produção — checagem acima).
const SECRET = JWT_SECRET || 'dev-only-secret-nao-usar-em-producao';
const TOKEN_TTL = '30d'; // técnico pode passar dias em campo sem reabrir sessão

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name, email: user.email }, SECRET, { expiresIn: TOKEN_TTL });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão para esta ação' });
    next();
  };
}
