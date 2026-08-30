import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import * as queries from './queries-postgres.js';

/**
 * Cria exatamente 3 contas reais (senha com hash de verdade, gravadas no
 * Postgres) só na primeira vez que o sistema sobe com a tabela de usuários
 * vazia — não é um mock embutido no bundle do frontend, é um bootstrap de
 * banco, do mesmo jeito que `django createsuperuser` ou similar. Nenhuma
 * estrutura/torre é semeada aqui.
 */
export async function seedTestAccountsIfEmpty() {
  const existing = await queries.getAllUsers();
  if (existing.length > 0) return;

  console.log('👤 Nenhum usuário encontrado — criando as 3 contas de teste iniciais...');

  const accounts = [
    { name: 'Técnico Teste', email: 'tecnico@inspec360.com', role: 'tecnico' },
    { name: 'Supervisor Teste', email: 'supervisor@inspec360.com', role: 'supervisor' },
    { name: 'Administrador', email: 'admin@inspec360.com', role: 'superadm' },
  ];

  console.log('🔑 Senhas geradas automaticamente (únicas por conta, veja abaixo). Altere depois do primeiro login:');
  for (const acc of accounts) {
    // Senha aleatória por conta — nunca um valor fixo compartilhado (evita brute-force/credential stuffing padrão).
    const password = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 10);
    await queries.createUser({ ...acc, passwordHash, status: 'active' });
    console.log(`   ${acc.email} — ${password}`);
  }
}
