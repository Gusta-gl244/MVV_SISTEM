import { initDb, runSQL } from './postgres-connection.js';

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA
//
// Cada entidade de topo é uma tabela real com colunas de sincronização
// ("updatedAt", "deletedAt" como tombstone de exclusão, "deviceId" para saber
// se o registro nasceu offline). Listas aninhadas que o frontend sempre lê/
// grava como uma unidade só (componentes inspecionados, histórico de pausas,
// log de atividade) viram colunas JSONB em vez de tabelas filhas — evita
// reescrever lógica de join que no schema antigo nem era usada corretamente.
// ─────────────────────────────────────────────────────────────────────────────

export async function initializeDatabase() {
  console.log('🔧 Inicializando banco PostgreSQL...');

  await initDb();
  console.log('✅ Conexão PostgreSQL estabelecida');

  await runSQL(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('tecnico', 'supervisor', 'superadm')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      phone TEXT,
      avatar TEXT,
      "lastLogin" TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "deletedAt" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS structures (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('Suspensão', 'Ancoragem', 'Transposição', 'Terminal', 'Ângulo', 'Estaiada')),
      classe TEXT,
      "coordX" REAL NOT NULL,
      "coordY" REAL NOT NULL,
      lat REAL,
      lng REAL,
      "alturaUtil" REAL,
      "vanFrente" REAL,
      "cotaCentro" REAL,
      progressiva REAL NOT NULL DEFAULT 0,
      deflexao REAL,
      "deflexaoTexto" TEXT,
      travessia TEXT,
      lt TEXT NOT NULL,
      voltage TEXT NOT NULL,
      "cadeiaCondutor" TEXT,
      "qtdCadeias" INTEGER,
      "cadeiaParaRaios" TEXT,
      "qtdCadeiasPR" INTEGER,
      "estruturaCritica" BOOLEAN DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'em-andamento', 'concluido', 'anomalia', 'atrasado')),
      observation TEXT,
      "createdBy" TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "deletedAt" TEXT,
      "deviceId" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS "componentRules" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      description TEXT,
      weight INTEGER NOT NULL DEFAULT 1,
      anomalies JSONB NOT NULL DEFAULT '[]',
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "deletedAt" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS severities (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'severidade' CHECK(kind IN ('severidade', 'risco')),
      label TEXT NOT NULL,
      color TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "deletedAt" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS "serviceOrders" (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('inspecao', 'execucao')),
      om TEXT,
      "inspectionType" TEXT,
      "structureId" TEXT NOT NULL,
      "technicianId" TEXT,
      "supervisorId" TEXT,
      priority TEXT CHECK(priority IN ('baixa', 'media', 'alta')),
      deadline TEXT,
      "scheduledDate" TEXT,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'em-andamento', 'pausado', 'concluido', 'cancelado')),
      "startedAt" TEXT,
      "pausedAt" TEXT,
      "resumedAt" TEXT,
      "completedAt" TEXT,
      "inspectionRecordId" TEXT,
      "executionRecordId" TEXT,
      component TEXT,
      anomaly TEXT,
      description TEXT,
      details TEXT,
      "deadlineRules" TEXT,
      "supervisorNotes" TEXT,
      "inspectionData" JSONB,
      photos JSONB NOT NULL DEFAULT '[]',
      "activityLog" JSONB NOT NULL DEFAULT '[]',
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "deletedAt" TEXT,
      "deviceId" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS "inspectionRecords" (
      id TEXT PRIMARY KEY,
      "orderId" TEXT,
      "estruturaId" TEXT,
      "estruturaNome" TEXT,
      "supervisorId" TEXT,
      "supervisorNome" TEXT,
      "tecnicoId" TEXT,
      "tecnicoNome" TEXT,
      "dataHoraAbertura" TEXT NOT NULL,
      "dataHoraFim" TEXT,
      status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto', 'em-andamento', 'pausado', 'concluido', 'cancelado')),
      components JSONB NOT NULL DEFAULT '[]',
      "historicoPausas" JSONB NOT NULL DEFAULT '[]',
      "observacoesGerais" TEXT,
      origem TEXT NOT NULL DEFAULT 'app' CHECK(origem IN ('app', 'importado')),
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "deletedAt" TEXT,
      "deviceId" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS "executionRecords" (
      id TEXT PRIMARY KEY,
      "orderId" TEXT,
      "inspectionId" TEXT,
      "estruturaId" TEXT,
      "estruturaNome" TEXT,
      "supervisorId" TEXT,
      "supervisorNome" TEXT,
      "tecnicoId" TEXT,
      "tecnicoNome" TEXT,
      componente TEXT,
      anomalia TEXT,
      descricao TEXT,
      detalhes TEXT,
      "prazoRegras" TEXT,
      "notasSupervisor" TEXT,
      "dataHoraAbertura" TEXT NOT NULL,
      "dataHoraExecucaoInicio" TEXT,
      "dataHoraExecucaoFim" TEXT,
      "dataHoraFim" TEXT,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'em-andamento', 'pausado', 'concluido', 'cancelado')),
      "historicoPausas" JSONB NOT NULL DEFAULT '[]',
      "observacoesGerais" TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "deletedAt" TEXT,
      "deviceId" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS splices (
      id TEXT PRIMARY KEY,
      "pontoEmenda" TEXT NOT NULL,
      "estruturaOrigem" TEXT NOT NULL,
      "estruturaDestino" TEXT NOT NULL,
      fase TEXT NOT NULL,
      tipo TEXT,
      descricao TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "deletedAt" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS "systemLogs" (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error', 'success')),
      module TEXT NOT NULL,
      message TEXT NOT NULL,
      "userId" TEXT,
      "userName" TEXT
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      "createdAt" TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('manual', 'scheduled')),
      "sizeBytes" INTEGER NOT NULL,
      data BYTEA NOT NULL
    )
  `);

  await runSQL(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      "updatedAt" TEXT NOT NULL
    )
  `);

  // Migração: a UNIQUE global em "email" impedia reaproveitar o e-mail de um
  // usuário excluído (exclusão é soft-delete — só marca "deletedAt", a linha
  // continua existindo). Troca por um índice único parcial que só considera
  // usuários ativos, liberando o e-mail assim que o usuário é excluído.
  await runSQL(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`);
  await runSQL(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_idx ON users (email) WHERE "deletedAt" IS NULL`);

  // Índices usados pelo motor de sincronização (pull por "updatedAt").
  await runSQL(`CREATE INDEX IF NOT EXISTS idx_structures_updated ON structures ("updatedAt")`);
  await runSQL(`CREATE INDEX IF NOT EXISTS idx_orders_updated ON "serviceOrders" ("updatedAt")`);
  await runSQL(`CREATE INDEX IF NOT EXISTS idx_inspections_updated ON "inspectionRecords" ("updatedAt")`);
  await runSQL(`CREATE INDEX IF NOT EXISTS idx_executions_updated ON "executionRecords" ("updatedAt")`);
  await runSQL(`CREATE INDEX IF NOT EXISTS idx_users_updated ON users ("updatedAt")`);

  console.log('✅ Todas as tabelas criadas/verificadas com sucesso!');
}
