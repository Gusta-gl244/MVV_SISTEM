import archiver from 'archiver';
import { PassThrough } from 'stream';
import { getQuery } from '../database/postgres-connection.js';

const TABLES_TO_EXPORT = [
  'users', 'structures', '"componentRules"', 'severities', '"serviceOrders"',
  '"inspectionRecords"', '"executionRecords"', 'splices', '"systemLogs"',
];

function extFromDataUrl(dataUrl) {
  const match = /^data:image\/(\w+);base64,/.exec(dataUrl);
  return match ? match[1].replace('jpeg', 'jpg') : 'jpg';
}

function base64ToBuffer(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

/**
 * As fotos capturadas em campo ficam como string base64 embutida dentro do
 * JSON da ordem/inspeção (não em uma tabela separada) — aqui elas são
 * extraídas e gravadas como arquivos de imagem reais, organizados por pasta,
 * em vez de ficarem escondidas dentro de um .json gigante.
 */
function appendPhotosFromOrders(archive, orders) {
  let count = 0;
  for (const order of orders) {
    const photos = order.photos || [];
    photos.forEach((dataUrl, i) => {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return;
      const ext = extFromDataUrl(dataUrl);
      archive.append(base64ToBuffer(dataUrl), { name: `images/ordens/${order.id}/${i + 1}.${ext}` });
      count++;
    });
  }
  return count;
}

function appendPhotosFromInspections(archive, inspections) {
  let count = 0;
  for (const inspection of inspections) {
    const components = inspection.components || [];
    for (const comp of components) {
      const photos = comp.photos || [];
      photos.forEach((dataUrl, i) => {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return;
        const ext = extFromDataUrl(dataUrl);
        const compFolder = comp.componentName || comp.componentId || 'geral';
        archive.append(base64ToBuffer(dataUrl), { name: `images/inspecoes/${inspection.id}/${compFolder}/${i + 1}.${ext}` });
        count++;
      });
    }
  }
  return count;
}

/**
 * Monta um ZIP em memória com um .json por tabela e as fotos de campo
 * extraídas como arquivos de imagem reais, organizados por ordem/inspeção —
 * tudo que existe no sistema, pronto para restaurar ou auditar offline.
 */
export async function buildFullBackupZip() {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks = [];
  const stream = new PassThrough();
  archive.pipe(stream);

  // O listener de conclusão precisa estar armado ANTES de finalize() — o
  // PassThrough pode emitir 'end' assim que finalize() termina de enfileirar
  // os bytes, o que às vezes acontece antes da promise de finalize()
  // resolver. Registrar depois de esperar por ela corre o risco de perder
  // um 'end' que já disparou, travando o backup para sempre.
  const done = new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
    archive.on('error', reject);
  });

  const tableRows = {};
  for (const table of TABLES_TO_EXPORT) {
    const plainName = table.replace(/"/g, '');
    const where = plainName === 'systemLogs' ? '' : ' WHERE "deletedAt" IS NULL';
    const rows = await getQuery(`SELECT * FROM ${table}${where}`);
    tableRows[plainName] = rows;
    archive.append(JSON.stringify(rows, null, 2), { name: `${plainName}.json` });
  }

  const photoCount =
    appendPhotosFromOrders(archive, tableRows.serviceOrders || []) +
    appendPhotosFromInspections(archive, tableRows.inspectionRecords || []);

  archive.append(
    JSON.stringify({ generatedAt: new Date().toISOString(), photoCount }, null, 2),
    { name: 'manifest.json' }
  );

  await archive.finalize();
  await done;

  return Buffer.concat(chunks);
}
