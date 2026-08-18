import pg from 'pg';

let pool = null;

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL Connection Pool
// ─────────────────────────────────────────────────────────────────────────────

export async function initDb() {
  if (pool) {
    console.log('✅ Conexão PostgreSQL já inicializada');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('❌ DATABASE_URL não definida! Configure a variável de ambiente com a connection string do PostgreSQL.');
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);

  try {
    console.log('📦 Conectando ao PostgreSQL...');

    pool = new pg.Pool({
      connectionString: databaseUrl,
      // Instância local (dev) não usa TLS; o Postgres gerenciado do Render exige.
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });

    const client = await pool.connect();
    console.log('✅ Conectado ao PostgreSQL com sucesso!');
    client.release();
  } catch (error) {
    console.error('❌ Erro ao conectar PostgreSQL:', error.message);
    throw error;
  }
}

export async function closeDb() {
  if (pool) {
    console.log('📴 Encerrando pool PostgreSQL...');
    await pool.end();
    pool = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Execution
// ─────────────────────────────────────────────────────────────────────────────

export async function runSQL(sql, params = []) {
  if (!pool) {
    throw new Error('Pool não inicializado. Chame initDb() primeiro.');
  }

  try {
    const result = await pool.query(sql, params);
    return {
      changes: result.rowCount,
      lastID: result.rows[0]?.id,
      rows: result.rows
    };
  } catch (error) {
    console.error('❌ Erro SQL:', error.message);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

export async function getQuery(sql, params = []) {
  if (!pool) {
    throw new Error('Pool não inicializado. Chame initDb() primeiro.');
  }

  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('❌ Erro ao buscar:', error.message);
    throw error;
  }
}

export async function getQueryOne(sql, params = []) {
  if (!pool) {
    throw new Error('Pool não inicializado. Chame initDb() primeiro.');
  }

  try {
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Erro ao buscar um:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Info
// ─────────────────────────────────────────────────────────────────────────────

export function getDbInfo() {
  if (!pool) {
    return null;
  }

  return {
    type: 'PostgreSQL',
    status: 'connected',
    timestamp: new Date().toISOString()
  };
}
