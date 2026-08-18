#!/usr/bin/env node
/**
 * Importa a planilha de referência real (estruturas, catálogo de componentes/
 * anomalias, escalas de severidade/risco, emendas, dados da linha e achados
 * históricos de inspeção de campo) para o banco novo. Roda uma vez, sob
 * demanda — não é chamado automaticamente no boot do servidor, porque é
 * dado real fornecido pelo usuário, não um seed genérico.
 *
 * Uso: node src/database/import-reference-data.js "<caminho para o .xlsx>"
 */
import xlsx from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { initDb, closeDb } from './postgres-connection.js';
import { initializeDatabase } from './init-postgres.js';
import * as queries from './queries-postgres.js';

const TYPE_CODE_TO_ENUM = { MVVT: 'Terminal', MVVS: 'Suspensão', MVVA: 'Ancoragem' };

function sheetRows(wb, name) {
  return xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false });
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// "59°00'04\"E" / "58°16'56\"D" → { degrees: 59.0011, raw: original }
function parseDeflexao(raw) {
  if (!raw) return { degrees: null, raw: null };
  const match = String(raw).match(/(\d+)[°º]\s*(\d+)['′]\s*(\d+)?/);
  if (!match) return { degrees: null, raw: String(raw) };
  const [, deg, min, sec] = match;
  const degrees = Number(deg) + Number(min) / 60 + (Number(sec) || 0) / 3600;
  return { degrees, raw: String(raw) };
}

// "2/1/26" (DD/MM/AA, planilha em pt-BR) → ISO
function parseBrDate(raw) {
  if (!raw) return null;
  const match = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let [, d, m, y] = match;
  if (y.length === 2) y = `20${y}`;
  const iso = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toISOString();
  return iso;
}

async function importStructures(wb, adminUserId) {
  const rows = sheetRows(wb, 'Cadastro_Estruturas');
  const header = rows[2];
  const idx = (name) => header.indexOf(name);
  const nameToId = new Map();
  let count = 0;

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    const name = row?.[idx('Estrutura')];
    if (!name) continue;

    const tipoCode = row[idx('Tipo')];
    const { degrees: deflexao, raw: deflexaoTexto } = parseDeflexao(row[idx('Deflexão')]);

    const created = await queries.createStructure({
      name: String(name),
      type: TYPE_CODE_TO_ENUM[tipoCode] || 'Suspensão',
      classe: row[idx('Classe')] || null,
      coordX: toNumber(row[idx('Coord. X')]),
      coordY: toNumber(row[idx('Coord. Y')]),
      alturaUtil: toNumber(row[idx('Altura útil (m)')]),
      vanFrente: toNumber(row[idx('Vão à vante (m)')]),
      cotaCentro: toNumber(row[idx('Cota centro (m)')]),
      progressiva: toNumber(row[idx('Progressiva (m)')]) || 0,
      deflexao,
      deflexaoTexto,
      travessia: row[idx('Travessia / ponto especial')] || null,
      estruturaCritica: String(row[idx('Estrutura crítica')]).toLowerCase() === 'sim',
      cadeiaCondutor: row[idx('Cadeia condutor')] || null,
      qtdCadeias: toNumber(row[idx('Qtd. cadeias condutor')]),
      cadeiaParaRaios: row[idx('Cadeia para-raios')] || null,
      qtdCadeiasPR: toNumber(row[idx('Qtd. cadeias PR')]),
      lt: 'LT 230 kV Arapiraca III – Serrote',
      voltage: '230kV',
      status: 'pendente',
      createdBy: adminUserId,
    });

    nameToId.set(String(name), created.id);
    count++;
  }

  console.log(`✅ ${count} estruturas importadas`);
  return nameToId;
}

async function importComponentsAndSeverities(wb) {
  const rows = sheetRows(wb, 'Referencias');

  // Pesos por componente: colunas 0/1 ("Componente"/"Peso"), linhas 3+
  const weights = new Map();
  for (let i = 3; i < rows.length; i++) {
    const name = rows[i]?.[0];
    const weight = toNumber(rows[i]?.[1]);
    if (name) weights.set(name, weight ?? 1);
  }

  // Catálogo de anomalias por componente: colunas 3/4 ("Componente"/"Anomalia padronizada")
  const anomaliesByComponent = new Map();
  for (let i = 3; i < rows.length; i++) {
    const component = rows[i]?.[3];
    const anomaly = rows[i]?.[4];
    if (!component || !anomaly) continue;
    if (!anomaliesByComponent.has(component)) anomaliesByComponent.set(component, []);
    anomaliesByComponent.get(component).push(anomaly);
  }

  let componentCount = 0;
  for (const [name, anomalies] of anomaliesByComponent) {
    await queries.createComponent({
      name,
      icon: '',
      description: '',
      weight: weights.get(name) ?? 1,
      anomalies,
    });
    componentCount++;
  }
  console.log(`✅ ${componentCount} componentes de checklist importados (com catálogo real de anomalias)`);

  // Severidade: colunas 6/7 ("Severidade"/"Pontos"); Risco: colunas 9/10 ("Risco"/"Pontos")
  const scaleColors = { Leve: '#22c55e', Moderada: '#eab308', Grave: '#f97316', Crítica: '#ef4444', Baixo: '#22c55e', Médio: '#eab308', Alto: '#ef4444' };
  let severityCount = 0;
  const seenSeverity = new Set();
  const seenRisk = new Set();
  for (let i = 3; i < rows.length; i++) {
    const sevLabel = rows[i]?.[6];
    const sevPoints = toNumber(rows[i]?.[7]);
    if (sevLabel && !seenSeverity.has(sevLabel)) {
      seenSeverity.add(sevLabel);
      await queries.createSeverity({ kind: 'severidade', label: sevLabel, points: sevPoints ?? 0, color: scaleColors[sevLabel] || '#888' });
      severityCount++;
    }
    const riskLabel = rows[i]?.[9];
    const riskPoints = toNumber(rows[i]?.[10]);
    if (riskLabel && !seenRisk.has(riskLabel)) {
      seenRisk.add(riskLabel);
      await queries.createSeverity({ kind: 'risco', label: riskLabel, points: riskPoints ?? 0, color: scaleColors[riskLabel] || '#888' });
      severityCount++;
    }
  }
  console.log(`✅ ${severityCount} níveis de severidade/risco importados`);
}

async function importSplices(wb) {
  const rows = sheetRows(wb, 'Cadastro_Emendas');
  let count = 0;
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[0]) continue;
    await queries.createSplice({
      pontoEmenda: row[0],
      estruturaOrigem: row[1],
      estruturaDestino: row[2],
      fase: row[3],
      tipo: row[4],
      descricao: row[5],
    });
    count++;
  }
  console.log(`✅ ${count} pontos de emenda importados`);
}

async function importLineInfo(wb) {
  const rows = sheetRows(wb, 'Dados_Linha');
  const info = {};
  for (let i = 3; i < rows.length; i++) {
    const [param, valor] = rows[i] || [];
    if (param) info[param] = valor;
  }
  await queries.setSetting('lineInfo', info);
  console.log(`✅ Dados gerais da linha importados (${Object.keys(info).length} parâmetros)`);
}

async function importHistoricalInspections(wb, nameToId, adminUserId) {
  const rows = sheetRows(wb, 'Inspecao_Campo');
  const header = rows[3];
  const idx = (name) => header.indexOf(name);

  // Agrupa achados por estrutura+inspetor+data — cada grupo vira um InspectionRecord histórico.
  const groups = new Map();
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    const estrutura = row?.[idx('Estrutura')];
    const componente = row?.[idx('Componente')];
    if (!estrutura || !componente) continue; // linha de template vazia

    const key = `${estrutura}|${row[idx('Inspetor')]}|${row[idx('Data')]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let count = 0;
  for (const [key, groupRows] of groups) {
    const first = groupRows[0];
    const estruturaTag = first[idx('Estrutura')];
    const estruturaId = nameToId.get(estruturaTag);
    if (!estruturaId) continue;

    const abertura = parseBrDate(first[idx('Data')]) || new Date().toISOString();
    const components = groupRows.map((row) => ({
      componentId: row[idx('Componente')],
      componentName: row[idx('Componente')],
      status: 'anomalia',
      anomalies: [{
        id: uuidv4(),
        anomalyName: row[idx('Tipo de anomalia')],
        severity: row[idx('Severidade')],
        phase: row[idx('Fase')],
        isEmenda: String(row[idx('É emenda?')]).toLowerCase() === 'sim',
        safetyRisk: row[idx('Risco segurança')],
        operationalRisk: row[idx('Risco operacional')],
        requiresShutdown: String(row[idx('Requer desligamento?')]).toLowerCase() === 'sim',
        isRecurrent: String(row[idx('Reincidente?')]).toLowerCase() === 'sim',
        observation: [
          row[idx('Observação de campo')],
          `Score histórico: ${row[idx('Score')] ?? '-'} (${row[idx('Criticidade')] ?? '-'})`,
        ].filter(Boolean).join(' — '),
      }],
    }));

    await queries.createInspection({
      estruturaId,
      estruturaNome: estruturaTag,
      supervisorId: adminUserId,
      supervisorNome: 'Administrador',
      tecnicoId: adminUserId,
      tecnicoNome: first[idx('Inspetor')] || 'Inspetor de campo',
      dataHoraAbertura: abertura,
      dataHoraFim: abertura,
      status: 'concluido',
      components,
      historicoPausas: [],
      observacoesGerais: 'Importado da planilha de referência (achados históricos de campo).',
      origem: 'importado',
    });
    count++;
  }
  console.log(`✅ ${count} registros de inspeção histórica importados (${[...groups.values()].flat().length} achados de anomalia)`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: node src/database/import-reference-data.js "<caminho para o .xlsx>"');
    process.exit(1);
  }

  await initDb();
  await initializeDatabase();

  const admin = (await queries.getAllUsers()).find((u) => u.role === 'superadm');
  if (!admin) {
    console.error('❌ Nenhum usuário superadm encontrado — rode o servidor uma vez primeiro para criar as contas de teste.');
    process.exit(1);
  }

  const wb = xlsx.readFile(filePath, { cellDates: true });

  const nameToId = await importStructures(wb, admin.id);
  await importComponentsAndSeverities(wb);
  await importSplices(wb);
  await importLineInfo(wb);
  await importHistoricalInspections(wb, nameToId, admin.id);

  console.log('\n🎉 Importação concluída com sucesso.');
  await closeDb();
}

main().catch((err) => {
  console.error('❌ Erro durante a importação:', err);
  process.exit(1);
});
