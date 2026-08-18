import bcrypt from 'bcryptjs';
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
  const password = 'inspec360';
  const passwordHash = await bcrypt.hash(password, 10);

  for (const acc of accounts) {
    await queries.createUser({ ...acc, passwordHash, status: 'active' });
  }

  console.log(`✅ Contas de teste criadas (senha para todas: "${password}"). Altere depois de testar.`);
}
