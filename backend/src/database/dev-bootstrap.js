import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEV_PORT = 54329;
const DEV_DB_NAME = 'inspec360_dev';
const DEV_DATA_DIR = path.join(__dirname, '../../.pgdata');

let embedded = null;

/**
 * Em desenvolvimento local, sem DATABASE_URL configurada (nenhum Postgres
 * instalado/Docker), sobe um Postgres real embutido (binário nativo baixado
 * via npm, sem Docker) e aponta DATABASE_URL para ele. Produção (Render)
 * nunca entra aqui porque DATABASE_URL já vem definida pelo ambiente.
 */
export async function ensureLocalDatabase() {
  if (process.env.DATABASE_URL) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL não definida em produção.');
  }

  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  embedded = new EmbeddedPostgres({
    databaseDir: DEV_DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: DEV_PORT,
    persistent: true,
  });

  const alreadyInitialized = await isClusterInitialized();
  if (!alreadyInitialized) {
    console.log('🐘 Nenhum Postgres local encontrado — inicializando um novo (primeira vez, pode demorar um pouco)...');
    await embedded.initialise();
  }

  await embedded.start();

  const connectionStringForPostgresDb = `postgresql://postgres:postgres@localhost:${DEV_PORT}/postgres`;
  const { Client } = await import('pg');
  const client = new Client({ connectionString: connectionStringForPostgresDb });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DEV_DB_NAME]);
  if (exists.rowCount === 0) {
    // UTF8/template0 explícito — o cluster local herda a codificação padrão
    // do Windows (ex.: WIN1252) se não for forçado, o que corromperia
    // acentuação em produção (o Postgres do Render é sempre UTF8).
    await client.query(`CREATE DATABASE ${DEV_DB_NAME} WITH ENCODING 'UTF8' TEMPLATE template0`);
    console.log(`🐘 Banco local "${DEV_DB_NAME}" criado (UTF8)`);
  }
  await client.end();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${DEV_PORT}/${DEV_DB_NAME}`;
  console.log(`✅ Postgres local embutido pronto em localhost:${DEV_PORT}`);

  process.on('SIGINT', stopLocalDatabase);
  process.on('SIGTERM', stopLocalDatabase);
}

async function isClusterInitialized() {
  const fs = await import('fs');
  return fs.existsSync(path.join(DEV_DATA_DIR, 'PG_VERSION'));
}

export async function stopLocalDatabase() {
  if (embedded) {
    console.log('🐘 Encerrando Postgres local embutido...');
    await embedded.stop();
    embedded = null;
  }
}
