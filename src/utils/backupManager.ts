import type { AppData } from '@/app/data/types';

/**
 * Exporta todos os dados (cópia local) em JSON — útil para uma cópia rápida
 * em disco. O backup completo e organizado (com fotos como arquivos reais)
 * é o ZIP gerado pelo servidor, ver src/api/client.js#backupsAPI.
 */
export function exportDataAsJSON(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function exportStructuresAsCSV(data: AppData): string {
  const headers = ['ID', 'Nome', 'Tipo', 'Classe', 'Latitude', 'Longitude', 'Status', 'Data de Criação'];
  const rows = data.structures.map((s) => [
    s.id, s.name, s.type, s.classe || '', s.coordY, s.coordX, s.status, s.createdAt || '',
  ]);
  return [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
}

export function exportServiceOrdersAsCSV(data: AppData): string {
  const headers = ['ID', 'Tipo', 'Estrutura', 'Técnico', 'Supervisor', 'Prioridade', 'Status', 'Prazo', 'Data de Criação'];
  const rows = data.serviceOrders.map((order) => [
    order.id, order.type, order.structureId, order.technicianId, order.supervisorId,
    order.priority, order.status, order.deadline, order.createdAt,
  ]);
  return [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
}

export function downloadFile(content: string, filename: string, type: 'json' | 'csv' = 'json'): void {
  const mimeType = type === 'json' ? 'application/json' : 'text/csv';
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function importDataFromFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        resolve(JSON.parse(event.target?.result as string));
      } catch {
        reject(new Error('Arquivo inválido ou corrompido'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsText(file);
  });
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('pt-BR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
