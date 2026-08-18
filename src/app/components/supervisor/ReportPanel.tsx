import { useState, useMemo } from 'react';
import {
  Filter,
  Download,
  FileText,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Building2,
  Camera,
  X,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import type { ServiceOrder, Structure, InspectionType } from '../../data/types';
import { INSPECTION_TYPES } from '../../data/types';
import { collectOrderPhotos } from '../../data/orderPhotos';
import inspec360Icon from '../../../assets/brand/inspec360-icon-white.png';
import grupoLogo from '../../../assets/brand/grupo-mvv-bnmc.png';

// Absoluta porque o relatório abre numa janela `about:blank` (window.open + document.write) —
// um caminho relativo ao bundle não resolveria contra a origem certa nessa janela.
const absoluteAssetUrl = (path: string) => new URL(path, window.location.href).href;

interface ReportPanelProps {
  orders: ServiceOrder[];
  structures: Structure[];
  technicians: { id: string; name: string }[];
  reportFilters: {
    dateFrom: string;
    dateTo: string;
    technicianId: string;
    orderType: 'all' | 'inspecao' | 'execucao';
    inspectionType: 'all' | InspectionType;
    status: 'all' | 'pendente' | 'em-andamento' | 'pausado' | 'concluido' | 'cancelado';
    structureId: string;
    om: string;
  };
  setReportFilters: React.Dispatch<React.SetStateAction<ReportPanelProps['reportFilters']>>;
  showReport: boolean;
  setShowReport: (v: boolean) => void;
  supervisorName: string;
  getStructureName: (id: string) => string;
  getTechnicianName: (id: string) => string;
}

function generateReportPDF(
  filteredOrders: ServiceOrder[],
  structures: Structure[],
  supervisorName: string,
  filters: ReportPanelProps['reportFilters'],
  getTechnicianName: (id: string) => string,
  getStructureName: (id: string) => string
) {
  const now = new Date().toLocaleString('pt-BR');
  const total = filteredOrders.length;
  const concluidos = filteredOrders.filter((o) => o.status === 'concluido').length;
  const emAndamento = filteredOrders.filter((o) => o.status === 'em-andamento' || o.status === 'pausado').length;
  const pendentes = filteredOrders.filter((o) => o.status === 'pendente').length;
  const anomalias = filteredOrders.filter((o) =>
    o.inspectionData?.components.some((c) => c.status === 'anomalia')
  ).length;

  const completionRate = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  const orderRows = filteredOrders
    .map(
      (o, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${o.id.toUpperCase()}</td>
        <td>${o.om || '—'}</td>
        <td>${o.type === 'inspecao' ? 'Inspeção' : 'Execução'}${o.inspectionType ? ` (${o.inspectionType})` : ''}</td>
        <td>${getStructureName(o.structureId)}</td>
        <td>${getTechnicianName(o.technicianId)}</td>
        <td>${o.priority === 'alta' ? 'Alta' : o.priority === 'media' ? 'Média' : 'Baixa'}</td>
        <td>${new Date(o.deadline).toLocaleDateString('pt-BR')}</td>
        <td style="color:${
          o.status === 'concluido'
            ? '#16a34a'
            : o.status === 'em-andamento'
            ? '#AA8933'
            : o.status === 'pausado'
            ? '#BCA55C'
            : o.status === 'cancelado'
            ? '#6b7280'
            : '#6b7280'
        }">
          ${
            o.status === 'concluido'
              ? '✓ Concluído'
              : o.status === 'em-andamento'
              ? '◷ Em Andamento'
              : o.status === 'pausado'
              ? '⏸ Pausado'
              : o.status === 'cancelado'
              ? '✕ Cancelado'
              : '○ Pendente'
          }
        </td>
        <td>${o.completedAt ? new Date(o.completedAt).toLocaleDateString('pt-BR') : '—'}</td>
        <td>${collectOrderPhotos(o).length}</td>
      </tr>`
    )
    .join('');

  // Registros fotográficos de todas as ordens filtradas que têm foto —
  // sem isso, o relatório analítico não mostrava nenhuma imagem, mesmo
  // quando as ordens tinham fotos registradas (só o relatório de uma
  // ordem individual, em "Ordens Concluídas", mostrava fotos).
  const photoSections = filteredOrders
    .map((o) => ({ order: o, photos: collectOrderPhotos(o) }))
    .filter(({ photos }) => photos.length > 0)
    .map(
      ({ order, photos }) => `
      <div class="photo-order-block">
        <div class="photo-order-title">
          ${order.id.toUpperCase()} — ${getStructureName(order.structureId)}
          <span class="photo-order-count">${photos.length} foto${photos.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="photos-grid">
          ${photos
            .map(
              (p, i) => `<div class="photo-item">
            <img src="${p}" alt="Foto ${i + 1}" onerror="this.style.display='none'" />
            <div class="photo-label">Foto ${i + 1}</div>
          </div>`
            )
            .join('')}
        </div>
      </div>`
    )
    .join('');
  const totalPhotos = filteredOrders.reduce((sum, o) => sum + collectOrderPhotos(o).length, 0);
  const ordersWithPhotosCount = filteredOrders.filter((o) => collectOrderPhotos(o).length > 0).length;

  // Group by technician
  const byTech: Record<string, { name: string; total: number; concluidos: number }> = {};
  filteredOrders.forEach((o) => {
    if (!byTech[o.technicianId]) {
      byTech[o.technicianId] = { name: getTechnicianName(o.technicianId), total: 0, concluidos: 0 };
    }
    byTech[o.technicianId].total++;
    if (o.status === 'concluido') byTech[o.technicianId].concluidos++;
  });

  const techRows = Object.values(byTech)
    .map(
      (t) => `<tr>
      <td>${t.name}</td>
      <td>${t.total}</td>
      <td>${t.concluidos}</td>
      <td>${t.total - t.concluidos}</td>
      <td>${t.total > 0 ? Math.round((t.concluidos / t.total) * 100) : 0}%</td>
    </tr>`
    )
    .join('');

  const filterDesc = [
    filters.orderType !== 'all' ? `Tipo: ${filters.orderType === 'inspecao' ? 'Inspeção' : 'Execução'}` : null,
    filters.inspectionType !== 'all' ? `Inspeção: ${filters.inspectionType}` : null,
    filters.status !== 'all' ? `Status: ${filters.status}` : null,
    filters.om ? `OM: ${filters.om}` : null,
    filters.dateFrom ? `De: ${filters.dateFrom}` : null,
    filters.dateTo ? `Até: ${filters.dateTo}` : null,
    filters.technicianId ? `Técnico: ${getTechnicianName(filters.technicianId)}` : null,
    filters.structureId ? `Estrutura: ${getStructureName(filters.structureId)}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Analítico – INSPEC360</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 10.5pt; }

    .cover {
      background: linear-gradient(135deg, #193A2A 0%, #2d5a3d 100%);
      color: white; padding: 48px 40px;
    }
    .cover-header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
    .cover-brand { display: flex; align-items: center; gap: 10px; }
    .cover-logo { height: 42px; width: 42px; }
    .cover-wordmark { font-size: 15pt; letter-spacing: 0.5px; }
    .cover-wordmark .accent { color: #AA8933; }
    .cover-divider { width: 1px; height: 50px; background: rgba(255,255,255,0.3); }
    .cover h1 { font-size: 24pt; letter-spacing: 0.5px; }
    .cover h2 { font-size: 12pt; opacity: 0.8; margin-top: 4px; }
    .cover-meta { 
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 24px;
      background: rgba(255,255,255,0.08); border-radius: 8px; padding: 16px;
    }
    .cover-meta-item label { font-size: 8pt; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px; }
    .cover-meta-item span { font-size: 10.5pt; }
    
    .stats-row { 
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
      padding: 28px 40px;
      background: #f8faf9;
      border-bottom: 1px solid #e5e7eb;
    }
    .stat-card { text-align: center; background: white; border-radius: 10px; padding: 16px 8px; border: 1px solid #e5e7eb; }
    .stat-card .val { font-size: 24pt; line-height: 1; margin-bottom: 4px; }
    .stat-card .lbl { font-size: 7.5pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .s-total .val { color: #193A2A; }
    .s-ok .val { color: #16a34a; }
    .s-progress .val { color: #AA8933; }
    .s-pending .val { color: #6b7280; }
    .s-anom .val { color: #dc2626; }
    .rate-badge { 
      background: linear-gradient(90deg, #193A2A, #AA8933);
      color: white; font-size: 9pt; padding: 4px 14px; border-radius: 20px;
      display: inline-block; margin-top: 6px;
    }
    
    .content { padding: 28px 40px; }
    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 12pt; color: #193A2A; padding-bottom: 8px;
      border-bottom: 2px solid #AA8933; margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }

    .filter-badge {
      display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0;
      color: #166534; font-size: 8pt; padding: 3px 10px; border-radius: 12px; margin-bottom: 12px;
    }

    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    thead tr { background: #193A2A; color: white; }
    thead th { padding: 9px 10px; text-align: left; font-size: 8pt; letter-spacing: 0.3px; }
    tbody tr { border-bottom: 1px solid #f0f0f0; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody td { padding: 8px 10px; vertical-align: top; }

    .tech-table thead tr { background: #2d5a3d; }

    .photo-order-block { margin-bottom: 20px; }
    .photo-order-title {
      font-size: 9.5pt; color: #193A2A; margin-bottom: 8px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .photo-order-count {
      font-size: 8pt; color: #6b7280; background: #f3f4f6; padding: 2px 10px; border-radius: 12px;
    }
    .photos-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    }
    .photo-item { text-align: center; }
    .photo-item img { width: 100%; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; }
    .photo-label { font-size: 7.5pt; color: #6b7280; margin-top: 3px; }

    .footer {
      margin-top: 32px; padding-top: 14px; border-top: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: center;
      color: #9ca3af; font-size: 8pt;
    }
    .footer-logo { height: 20px; width: auto; opacity: 0.85; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .section { page-break-inside: avoid; }
      .photo-order-block { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

<div class="cover">
  <div class="cover-header">
    <div class="cover-brand">
      <img src="${absoluteAssetUrl(inspec360Icon)}" alt="" class="cover-logo" />
      <span class="cover-wordmark">INSPEC<span class="accent">360</span></span>
    </div>
    <div class="cover-divider"></div>
    <div>
      <h1>Relatório Analítico</h1>
      <h2>INSPEC360 · Sistema de Inspeções · LT 230kV</h2>
    </div>
  </div>
  <div class="cover-meta">
    <div class="cover-meta-item">
      <label>Supervisor Responsável</label>
      <span>${supervisorName}</span>
    </div>
    <div class="cover-meta-item">
      <label>Data de Emissão</label>
      <span>${now}</span>
    </div>
    <div class="cover-meta-item">
      <label>Total de Registros</label>
      <span>${total} ordem${total !== 1 ? 's' : ''}</span>
    </div>
    ${
      filters.dateFrom || filters.dateTo
        ? `<div class="cover-meta-item">
          <label>Período</label>
          <span>${filters.dateFrom || 'início'} até ${filters.dateTo || 'hoje'}</span>
        </div>`
        : ''
    }
  </div>
</div>

<div class="stats-row">
  <div class="stat-card s-total">
    <div class="val">${total}</div>
    <div class="lbl">Total</div>
  </div>
  <div class="stat-card s-ok">
    <div class="val">${concluidos}</div>
    <div class="lbl">Concluídas</div>
    <div class="rate-badge">${completionRate}%</div>
  </div>
  <div class="stat-card s-progress">
    <div class="val">${emAndamento}</div>
    <div class="lbl">Em Andamento</div>
  </div>
  <div class="stat-card s-pending">
    <div class="val">${pendentes}</div>
    <div class="lbl">Pendentes</div>
  </div>
  <div class="stat-card s-anom">
    <div class="val">${anomalias}</div>
    <div class="lbl">C/ Anomalias</div>
  </div>
</div>

<div class="content">

  ${
    filterDesc
      ? `<div><span class="filter-badge">Filtros aplicados: ${filterDesc}</span></div>`
      : ''
  }

  <div class="section">
    <div class="section-title">📊 Desempenho por Técnico</div>
    <table class="tech-table">
      <thead>
        <tr>
          <th>Técnico</th>
          <th>Total de Ordens</th>
          <th>Concluídas</th>
          <th>Pendentes/Em Andamento</th>
          <th>Taxa de Conclusão</th>
        </tr>
      </thead>
      <tbody>${techRows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af">Sem dados</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">📋 Lista Detalhada de Ordens</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>ID</th>
          <th>OM</th>
          <th>Tipo</th>
          <th>Estrutura</th>
          <th>Técnico</th>
          <th>Prioridade</th>
          <th>Prazo</th>
          <th>Status</th>
          <th>Conclusão</th>
          <th>Fotos</th>
        </tr>
      </thead>
      <tbody>${orderRows || '<tr><td colspan="11" style="text-align:center;color:#9ca3af">Nenhuma ordem encontrada</td></tr>'}</tbody>
    </table>
  </div>

  ${
    totalPhotos > 0
      ? `<div class="section">
    <div class="section-title">📷 Registros Fotográficos (${totalPhotos} foto${totalPhotos !== 1 ? 's' : ''} em ${ordersWithPhotosCount} ordem${ordersWithPhotosCount !== 1 ? 's' : ''})</div>
    ${photoSections}
  </div>`
      : ''
  }

  <div class="footer">
    <img src="${absoluteAssetUrl(grupoLogo)}" alt="Mineração Vale Verde · BNMC" class="footer-logo" />
    <span>Gerado em ${now}</span>
    <span>${total} registro${total !== 1 ? 's' : ''} · ${completionRate}% conclusão</span>
  </div>
</div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=1000,height=750');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

const ORDER_STATUS_CONFIG = {
  pendente: { label: 'Pendente', color: '#6b7280', bg: '#f3f4f6' },
  'em-andamento': { label: 'Em Andamento', color: '#AA8933', bg: '#fff8e1' },
  pausado: { label: 'Pausado', color: '#BCA55C', bg: '#fffde7' },
  concluido: { label: 'Concluído', color: '#16a34a', bg: '#f0fdf4' },
  cancelado: { label: 'Cancelado', color: '#6b7280', bg: '#f3f4f6' },
};

export function ReportPanel({
  orders,
  structures,
  technicians,
  reportFilters,
  setReportFilters,
  showReport,
  setShowReport,
  supervisorName,
  getStructureName,
  getTechnicianName,
}: ReportPanelProps) {
  const [showFilters, setShowFilters] = useState(false);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (reportFilters.orderType !== 'all' && o.type !== reportFilters.orderType) return false;
      if (reportFilters.inspectionType !== 'all' && o.inspectionType !== reportFilters.inspectionType) return false;
      if (reportFilters.status !== 'all' && o.status !== reportFilters.status) return false;
      if (reportFilters.technicianId && o.technicianId !== reportFilters.technicianId) return false;
      if (reportFilters.structureId && o.structureId !== reportFilters.structureId) return false;
      if (reportFilters.om && !(o.om || '').toLowerCase().includes(reportFilters.om.toLowerCase())) return false;
      if (reportFilters.dateFrom && o.createdAt < reportFilters.dateFrom) return false;
      if (reportFilters.dateTo && o.createdAt > reportFilters.dateTo + 'T23:59:59Z') return false;
      return true;
    });
  }, [orders, reportFilters]);

  const stats = useMemo(() => {
    const total = filteredOrders.length;
    const concluidos = filteredOrders.filter((o) => o.status === 'concluido').length;
    const emAndamento = filteredOrders.filter((o) => o.status === 'em-andamento' || o.status === 'pausado').length;
    const pendentes = filteredOrders.filter((o) => o.status === 'pendente').length;
    const anomalias = filteredOrders.filter((o) =>
      o.inspectionData?.components.some((c) => c.status === 'anomalia')
    ).length;
    const atrasados = filteredOrders.filter(
      (o) => o.status !== 'concluido' && new Date(o.deadline) < new Date()
    ).length;
    return { total, concluidos, emAndamento, pendentes, anomalias, atrasados };
  }, [filteredOrders]);

  const hasFilters =
    reportFilters.orderType !== 'all' ||
    reportFilters.inspectionType !== 'all' ||
    reportFilters.status !== 'all' ||
    reportFilters.technicianId ||
    reportFilters.structureId ||
    reportFilters.om ||
    reportFilters.dateFrom ||
    reportFilters.dateTo;

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm" style={{ color: '#193A2A' }}>Relatório Analítico</h2>
          <p className="text-xs text-gray-400">{filteredOrders.length} ordem{filteredOrders.length !== 1 ? 's' : ''} encontrada{filteredOrders.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5 text-xs"
            style={{ borderColor: hasFilters ? '#AA8933' : undefined, color: hasFilters ? '#AA8933' : undefined }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
            {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-0.5" />}
          </Button>
          <Button
            size="sm"
            className="text-white flex items-center gap-1.5 text-xs"
            style={{ backgroundColor: '#193A2A' }}
            onClick={() => generateReportPDF(filteredOrders, structures, supervisorName, reportFilters, getTechnicianName, getStructureName)}
          >
            <Download className="w-3.5 h-3.5" />
            Baixar PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Filtros</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setReportFilters({
                    dateFrom: '',
                    dateTo: '',
                    technicianId: '',
                    orderType: 'all',
                    inspectionType: 'all',
                    status: 'all',
                    structureId: '',
                    om: '',
                  });
                }}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Limpar
              </button>
              <button onClick={() => setShowFilters(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Tipo de Ordem</label>
            <div className="flex gap-2">
              {(['all', 'inspecao', 'execucao'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setReportFilters((f) => ({ ...f, orderType: t }))}
                  className="flex-1 text-xs py-1.5 rounded-lg border-2 transition-all"
                  style={{
                    borderColor: reportFilters.orderType === t ? '#AA8933' : '#e5e7eb',
                    backgroundColor: reportFilters.orderType === t ? '#fff8e1' : '#fff',
                    color: reportFilters.orderType === t ? '#AA8933' : '#6b7280',
                  }}
                >
                  {t === 'all' ? 'Todos' : t === 'inspecao' ? 'Inspeção' : 'Execução'}
                </button>
              ))}
            </div>
          </div>

          {/* Inspection type */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Tipo de Inspeção</label>
            <div className="grid grid-cols-4 gap-2">
              {(['all', ...INSPECTION_TYPES] as const).map((it) => (
                <button
                  key={it}
                  onClick={() => setReportFilters((f) => ({ ...f, inspectionType: it }))}
                  className="text-xs py-1.5 rounded-lg border-2 transition-all"
                  style={{
                    borderColor: reportFilters.inspectionType === it ? '#AA8933' : '#e5e7eb',
                    backgroundColor: reportFilters.inspectionType === it ? '#fff8e1' : '#fff',
                    color: reportFilters.inspectionType === it ? '#AA8933' : '#6b7280',
                  }}
                >
                  {it === 'all' ? 'Todos' : it}
                </button>
              ))}
            </div>
          </div>

          {/* OM */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">OM</label>
            <Input
              className="text-sm"
              placeholder="Buscar por OM..."
              value={reportFilters.om}
              onChange={(e) => setReportFilters((f) => ({ ...f, om: e.target.value }))}
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Status</label>
            <select
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#AA8933]"
              value={reportFilters.status}
              onChange={(e) => setReportFilters((f) => ({ ...f, status: e.target.value as typeof f.status }))}
            >
              <option value="all">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="em-andamento">Em Andamento</option>
              <option value="pausado">Pausado</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {/* Technician + Structure */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Técnico</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none"
                value={reportFilters.technicianId}
                onChange={(e) => setReportFilters((f) => ({ ...f, technicianId: e.target.value }))}
              >
                <option value="">Todos</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Estrutura</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:outline-none"
                value={reportFilters.structureId}
                onChange={(e) => setReportFilters((f) => ({ ...f, structureId: e.target.value }))}
              >
                <option value="">Todas</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Criado de</label>
              <Input
                type="date"
                className="text-sm"
                value={reportFilters.dateFrom}
                onChange={(e) => setReportFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Criado até</label>
              <Input
                type="date"
                className="text-sm"
                value={reportFilters.dateTo}
                onChange={(e) => setReportFilters((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total', value: stats.total, icon: FileText, color: '#193A2A', bg: '#f0faf4' },
          { label: 'Concluídas', value: stats.concluidos, icon: CheckCircle2, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Em Andamento', value: stats.emAndamento, icon: Clock, color: '#AA8933', bg: '#fff8e1' },
          { label: 'Pendentes', value: stats.pendentes, icon: BarChart3, color: '#6b7280', bg: '#f9fafb' },
          { label: 'Atrasadas', value: stats.atrasados, icon: AlertTriangle, color: '#ea580c', bg: '#fff7ed' },
          { label: 'C/ Anomalias', value: stats.anomalias, icon: AlertTriangle, color: '#dc2626', bg: '#fef2f2' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="p-3 shadow-sm" style={{ backgroundColor: bg }}>
            <div className="flex items-center gap-2">
              <Icon className="w-5 h-5 shrink-0" style={{ color }} />
              <div>
                <div className="text-lg" style={{ color }}>{value}</div>
                <div className="text-[10px] text-gray-500">{label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Completion rate */}
      {stats.total > 0 && (
        <Card className="p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Taxa de Conclusão</span>
            <span className="text-sm" style={{ color: '#193A2A' }}>
              {Math.round((stats.concluidos / stats.total) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((stats.concluidos / stats.total) * 100)}%`,
                background: 'linear-gradient(90deg, #193A2A, #AA8933)',
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{stats.concluidos} concluídas</span>
            <span>{stats.total - stats.concluidos} restantes</span>
          </div>
        </Card>
      )}

      {/* Order list */}
      <div>
        <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-2 px-1">
          Lista de Ordens ({filteredOrders.length})
        </h3>
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-400">Nenhuma ordem corresponde aos filtros</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => {
              const cfg = ORDER_STATUS_CONFIG[order.status];
              const isLate = order.status !== 'concluido' && new Date(order.deadline) < new Date();
              const anomCount =
                order.inspectionData?.components.filter((c) => c.status === 'anomalia').length ?? 0;
              const photoCount = collectOrderPhotos(order).length;
              return (
                <Card key={order.id} className="p-3 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div
                      className="w-1.5 h-12 rounded-full shrink-0"
                      style={{ backgroundColor: isLate ? '#ea580c' : cfg.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: order.type === 'inspecao' ? '#193A2A' : '#AA8933' }}
                        >
                          {order.type === 'inspecao' ? 'INS' : 'EXE'}
                        </span>
                        {order.inspectionType && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            {order.inspectionType}
                          </span>
                        )}
                        <span className="text-xs text-gray-700 truncate">
                          {getStructureName(order.structureId)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 flex-wrap">
                        <span>{order.om || '—'}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {getTechnicianName(order.technicianId)}
                        </span>
                        <span>•</span>
                        <span>{new Date(order.deadline).toLocaleDateString('pt-BR')}</span>
                        {anomCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-red-500">{anomCount} anomalia{anomCount !== 1 ? 's' : ''}</span>
                          </>
                        )}
                        {photoCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Camera className="w-3 h-3" />
                              {photoCount} foto{photoCount !== 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                        style={{ color: cfg.color, backgroundColor: cfg.bg }}
                      >
                        {cfg.label}
                      </span>
                      {isLate && (
                        <span className="text-[10px] text-orange-500">⚠ Atrasado</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
