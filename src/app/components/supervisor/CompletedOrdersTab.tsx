import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  ChevronRight,
  FileText,
  Camera,
  Activity,
  Calendar,
  Building2,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import type { ServiceOrder, Structure } from '../../data/types';
import { collectOrderPhotos } from '../../data/orderPhotos';
import { PhotoLightbox } from '../../../components/PhotoLightbox';
import inspec360Icon from '../../../assets/brand/inspec360-icon-white.png';
import grupoLogo from '../../../assets/brand/grupo-mvv-bnmc.png';

// Absoluta porque o relatório abre numa janela `about:blank` (window.open + document.write) —
// um caminho relativo ao bundle não resolveria contra a origem certa nessa janela.
const absoluteAssetUrl = (path: string) => new URL(path, window.location.href).href;

interface CompletedOrdersTabProps {
  orders: ServiceOrder[];
  structures: Structure[];
  technicians: { id: string; name: string }[];
  getStructureName: (id: string) => string;
  getTechnicianName: (id: string) => string;
}

function generateOrderPDF(
  order: ServiceOrder,
  structure: Structure | undefined,
  techName: string,
  supervisorName?: string
) {
  const dateStr = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const timeStr = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('pt-BR') : '—';

  const anomalyRows =
    order.inspectionData?.components
      .filter((c) => c.status === 'anomalia')
      .flatMap((c) =>
        c.anomalies.map(
          (a) => `
          <tr>
            <td>${c.componentName}</td>
            <td>${a.anomalyName}</td>
            <td>${a.severity}</td>
            <td>${a.phase}</td>
            <td>${a.requiresShutdown ? 'Sim' : 'Não'}</td>
            <td>${a.observation || '—'}</td>
          </tr>`
        )
      )
      .join('') || '';

  const componentRows =
    order.inspectionData?.components
      .map(
        (c) => `
        <tr>
          <td>${c.componentName}</td>
          <td style="color:${c.status === 'ok' ? '#16a34a' : c.status === 'anomalia' ? '#dc2626' : '#6b7280'}">
            ${c.status === 'ok' ? '✓ OK' : c.status === 'anomalia' ? '⚠ Anomalia' : c.status === 'nao-aplicavel' ? 'N/A' : 'Pendente'}
          </td>
          <td>${c.notes || '—'}</td>
        </tr>`
      )
      .join('') || '';

  const photos = collectOrderPhotos(order);
  const photosHtml =
    photos.length > 0
      ? `<div class="photos-grid">
          ${photos
            .map(
              (p, i) => `<div class="photo-item">
            <img src="${p}" alt="Foto ${i + 1}" onerror="this.style.display='none'" />
            <div class="photo-label">Foto ${i + 1}</div>
          </div>`
            )
            .join('')}
        </div>`
      : '<p style="color:#6b7280;font-style:italic;">Nenhuma foto registrada.</p>';

  const logRows =
    order.activityLog
      ?.map(
        (log) => `
        <tr>
          <td>${timeStr(log.timestamp)}</td>
          <td>${log.userName}</td>
          <td>${log.action}</td>
          <td>${log.details || '—'}</td>
        </tr>`
      )
      .join('') || '';

  const okCount = order.inspectionData?.components.filter((c) => c.status === 'ok').length ?? 0;
  const anomCount = order.inspectionData?.components.filter((c) => c.status === 'anomalia').length ?? 0;
  const naCount = order.inspectionData?.components.filter((c) => c.status === 'nao-aplicavel').length ?? 0;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório – ${order.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; background: #fff; font-size: 11pt; }
    
    .cover { 
      background: linear-gradient(135deg, #193A2A 0%, #2d5a3d 100%);
      color: white; padding: 48px 40px; min-height: 200px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .cover-header { display: flex; align-items: center; gap: 20px; margin-bottom: 16px; }
    .cover-brand { display: flex; align-items: center; gap: 10px; }
    .cover-logo { height: 42px; width: 42px; }
    .cover-wordmark { font-size: 15pt; letter-spacing: 0.5px; }
    .cover-wordmark .accent { color: #AA8933; }
    .cover-divider { width: 1px; height: 50px; background: rgba(255,255,255,0.3); }
    .cover-title { font-size: 22pt; letter-spacing: 0.5px; }
    .cover-subtitle { font-size: 11pt; opacity: 0.8; margin-top: 4px; }
    .cover-badge { 
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(170,137,51,0.3); border: 1px solid rgba(170,137,51,0.6);
      color: #f0d078; padding: 4px 12px; border-radius: 20px; font-size: 9pt;
      margin-top: 8px; width: fit-content;
    }
    .cover-meta { 
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 20px;
      background: rgba(255,255,255,0.08); border-radius: 8px; padding: 16px;
    }
    .cover-meta-item label { font-size: 8pt; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
    .cover-meta-item span { font-size: 11pt; }
    
    .content { padding: 32px 40px; }
    
    .section { margin-bottom: 28px; }
    .section-title { 
      font-size: 13pt; color: #193A2A; padding-bottom: 8px; 
      border-bottom: 2px solid #AA8933; margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-icon { font-size: 14pt; }
    
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .info-item { background: #f8f9fa; border-radius: 8px; padding: 12px 16px; border-left: 3px solid #AA8933; }
    .info-item label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px; }
    .info-item span { font-size: 11pt; color: #1a1a1a; }
    
    .status-badge {
      display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 9pt;
    }
    .status-concluido { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .status-inspecao { background: #f0fdf4; color: #193A2A; border: 1px solid #193A2A; }
    .status-execucao { background: #fff8e1; color: #AA8933; border: 1px solid #fde68a; }
    
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .stat-card { 
      text-align: center; padding: 16px 8px; border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .stat-card .stat-value { font-size: 22pt; line-height: 1; margin-bottom: 4px; }
    .stat-card .stat-label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-ok .stat-value { color: #16a34a; }
    .stat-anom .stat-value { color: #dc2626; }
    .stat-na .stat-value { color: #6b7280; }
    .stat-total .stat-value { color: #193A2A; }
    
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    thead tr { background: #193A2A; color: white; }
    thead th { padding: 10px 12px; text-align: left; font-size: 8.5pt; letter-spacing: 0.3px; }
    tbody tr { border-bottom: 1px solid #f0f0f0; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody td { padding: 9px 12px; vertical-align: top; }
    
    .anomaly-table thead tr { background: #7f1d1d; }
    
    .photos-grid { 
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 8px;
    }
    .photo-item { text-align: center; }
    .photo-item img { width: 100%; height: 160px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; }
    .photo-label { font-size: 8pt; color: #6b7280; margin-top: 4px; }
    
    .notes-box { 
      background: #fffde7; border: 1px solid #fde68a; border-radius: 8px;
      padding: 14px; color: #78350f; font-size: 10.5pt; line-height: 1.5;
    }
    
    .footer {
      margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: center;
      color: #9ca3af; font-size: 8.5pt;
    }
    .footer-logo { height: 22px; width: auto; opacity: 0.85; }
    
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .cover { -webkit-print-color-adjust: exact; }
      .section { page-break-inside: avoid; }
      .photos-grid { page-break-inside: avoid; }
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
      <div class="cover-title">Relatório de Ordem de Serviço</div>
      <div class="cover-subtitle">INSPEC360 · Sistema de Inspeções · LT 230kV</div>
    </div>
  </div>
  <div class="cover-badge">✓ Ordem Concluída</div>
  <div class="cover-meta">
    <div class="cover-meta-item">
      <label>Nº da Ordem</label>
      <span>${order.id.toUpperCase()}</span>
    </div>
    <div class="cover-meta-item">
      <label>OM</label>
      <span>${order.om || '—'}</span>
    </div>
    <div class="cover-meta-item">
      <label>Tipo</label>
      <span>${order.type === 'inspecao' ? 'Inspeção' : 'Execução de Serviço'}${order.inspectionType ? ` (${order.inspectionType})` : ''}</span>
    </div>
    <div class="cover-meta-item">
      <label>Data de Conclusão</label>
      <span>${dateStr(order.completedAt)}</span>
    </div>
    <div class="cover-meta-item">
      <label>Estrutura</label>
      <span>${structure?.name || '—'} (${structure?.type || '—'})</span>
    </div>
    <div class="cover-meta-item">
      <label>Técnico Responsável</label>
      <span>${techName}</span>
    </div>
    <div class="cover-meta-item">
      <label>Supervisor</label>
      <span>${supervisorName || '—'}</span>
    </div>
  </div>
</div>

<div class="content">

  <div class="section">
    <div class="section-title"><span class="section-icon">📋</span> Informações Gerais</div>
    <div class="info-grid">
      <div class="info-item">
        <label>Linha de Transmissão</label>
        <span>${structure?.lt || '—'}</span>
      </div>
      <div class="info-item">
        <label>Tensão</label>
        <span>${structure?.voltage || '—'}</span>
      </div>
      <div class="info-item">
        <label>Progressiva</label>
        <span>${structure ? structure.progressiva.toLocaleString('pt-BR') + ' m' : '—'}</span>
      </div>
      <div class="info-item">
        <label>Prioridade</label>
        <span>${order.priority === 'alta' ? '🔴 Alta' : order.priority === 'media' ? '🟡 Média' : '🟢 Baixa'}</span>
      </div>
      <div class="info-item">
        <label>Data de Criação</label>
        <span>${dateStr(order.createdAt)}</span>
      </div>
      <div class="info-item">
        <label>Prazo Original</label>
        <span>${dateStr(order.deadline)}</span>
      </div>
      <div class="info-item">
        <label>Data de Início</label>
        <span>${dateStr(order.startedAt)}</span>
      </div>
      <div class="info-item">
        <label>Data de Conclusão</label>
        <span>${dateStr(order.completedAt)}</span>
      </div>
    </div>
  </div>

  ${
    order.type === 'execucao'
      ? `<div class="section">
    <div class="section-title"><span class="section-icon">🔧</span> Detalhes do Serviço</div>
    <div class="info-grid">
      ${order.component ? `<div class="info-item"><label>Componente</label><span>${order.component}</span></div>` : ''}
      ${order.anomaly ? `<div class="info-item"><label>Anomalia</label><span>${order.anomaly}</span></div>` : ''}
      ${order.description ? `<div class="info-item" style="grid-column:1/-1"><label>Descrição do Serviço</label><span>${order.description}</span></div>` : ''}
      ${order.details ? `<div class="info-item" style="grid-column:1/-1"><label>Detalhes Técnicos</label><span>${order.details}</span></div>` : ''}
    </div>
    ${order.deadlineRules ? `<div style="margin-top:12px"><div class="notes-box"><strong>Regras / Prazo:</strong> ${order.deadlineRules}</div></div>` : ''}
    ${order.supervisorNotes ? `<div style="margin-top:12px"><div class="notes-box"><strong>Observações do Supervisor:</strong> ${order.supervisorNotes}</div></div>` : ''}
  </div>`
      : ''
  }

  ${
    order.inspectionData
      ? `<div class="section">
    <div class="section-title"><span class="section-icon">🔍</span> Resultado da Inspeção</div>
    <div class="stats-row">
      <div class="stat-card stat-total">
        <div class="stat-value">${order.inspectionData.components.length}</div>
        <div class="stat-label">Total Componentes</div>
      </div>
      <div class="stat-card stat-ok">
        <div class="stat-value">${okCount}</div>
        <div class="stat-label">OK</div>
      </div>
      <div class="stat-card stat-anom">
        <div class="stat-value">${anomCount}</div>
        <div class="stat-label">Anomalias</div>
      </div>
      <div class="stat-card stat-na">
        <div class="stat-value">${naCount}</div>
        <div class="stat-label">Não Aplicável</div>
      </div>
    </div>
    ${
      order.inspectionData.generalNotes
        ? `<div class="notes-box" style="margin-bottom:16px"><strong>Observações Gerais:</strong> ${order.inspectionData.generalNotes}</div>`
        : ''
    }
    <table>
      <thead><tr><th>Componente</th><th>Status</th><th>Observações</th></tr></thead>
      <tbody>${componentRows}</tbody>
    </table>
    ${
      anomalyRows
        ? `<div style="margin-top:20px">
        <div class="section-title" style="color:#7f1d1d;border-bottom-color:#dc2626"><span class="section-icon">⚠️</span> Anomalias Detectadas</div>
        <table class="anomaly-table">
          <thead><tr><th>Componente</th><th>Anomalia</th><th>Severidade</th><th>Fase</th><th>Req. Desligamento</th><th>Observação</th></tr></thead>
          <tbody>${anomalyRows}</tbody>
        </table>
      </div>`
        : ''
    }
  </div>`
      : ''
  }

  ${
    photos.length > 0
      ? `<div class="section">
    <div class="section-title"><span class="section-icon">📷</span> Registros Fotográficos (${photos.length} foto${photos.length !== 1 ? 's' : ''})</div>
    ${photosHtml}
  </div>`
      : ''
  }

  ${
    order.activityLog && order.activityLog.length > 0
      ? `<div class="section">
    <div class="section-title"><span class="section-icon">📝</span> Histórico de Atividades</div>
    <table>
      <thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead>
      <tbody>${logRows}</tbody>
    </table>
  </div>`
      : ''
  }

  <div class="footer">
    <img src="${absoluteAssetUrl(grupoLogo)}" alt="Mineração Vale Verde · BNMC" class="footer-logo" />
    <span>Relatório gerado em ${new Date().toLocaleString('pt-BR')}</span>
    <span>Ordem: ${order.id.toUpperCase()}</span>
  </div>

</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

export function CompletedOrdersTab({
  orders,
  structures,
  technicians,
  getStructureName,
  getTechnicianName,
}: CompletedOrdersTabProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'inspecao' | 'execucao'>('all');
  const [filterTech, setFilterTech] = useState('');
  const [filterStructure, setFilterStructure] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === 'concluido'),
    [orders]
  );

  const filtered = useMemo(() => {
    return completedOrders.filter((o) => {
      const structName = getStructureName(o.structureId).toLowerCase();
      const techName = getTechnicianName(o.technicianId).toLowerCase();
      const q = search.toLowerCase();
      if (
        q &&
        !structName.includes(q) &&
        !techName.includes(q) &&
        !o.id.toLowerCase().includes(q) &&
        !(o.om || '').toLowerCase().includes(q)
      )
        return false;
      if (filterType !== 'all' && o.type !== filterType) return false;
      if (filterTech && o.technicianId !== filterTech) return false;
      if (filterStructure && o.structureId !== filterStructure) return false;
      if (filterDateFrom && o.completedAt && o.completedAt < filterDateFrom) return false;
      if (filterDateTo && o.completedAt && o.completedAt > filterDateTo + 'T23:59:59Z') return false;
      return true;
    });
  }, [completedOrders, search, filterType, filterTech, filterStructure, filterDateFrom, filterDateTo, getStructureName, getTechnicianName]);

  const hasFilters = filterType !== 'all' || filterTech || filterStructure || filterDateFrom || filterDateTo;

  if (selectedOrder) {
    const structure = structures.find((s) => s.id === selectedOrder.structureId);
    const techName = getTechnicianName(selectedOrder.technicianId);
    const okCount = selectedOrder.inspectionData?.components.filter((c) => c.status === 'ok').length ?? 0;
    const anomCount = selectedOrder.inspectionData?.components.filter((c) => c.status === 'anomalia').length ?? 0;
    const naCount = selectedOrder.inspectionData?.components.filter((c) => c.status === 'nao-aplicavel').length ?? 0;
    const selectedPhotos = collectOrderPhotos(selectedOrder);

    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 max-w-3xl mx-auto">
            <button
              onClick={() => setSelectedOrder(null)}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <div className="text-xs text-gray-500">Relatório Completo</div>
              <div className="text-sm text-gray-800">{selectedOrder.id.toUpperCase()}</div>
            </div>
            <Button
              size="sm"
              className="text-white flex items-center gap-1.5"
              style={{ backgroundColor: '#193A2A' }}
              onClick={() => generateOrderPDF(selectedOrder, structure, techName)}
            >
              <Download className="w-3.5 h-3.5" />
              Baixar PDF
            </Button>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4 max-w-3xl mx-auto w-full pb-8">
          {/* Cover card */}
          <div className="rounded-xl overflow-hidden shadow-sm">
            <div className="h-2" style={{ background: 'linear-gradient(90deg, #193A2A, #AA8933)' }} />
            <div className="bg-white p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span
                      className="text-xs px-2.5 py-1 rounded-full text-white"
                      style={{ backgroundColor: selectedOrder.type === 'inspecao' ? '#193A2A' : '#AA8933' }}
                    >
                      {selectedOrder.type === 'inspecao' ? 'Inspeção' : 'Execução'}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                      ✓ Concluída
                    </span>
                    {selectedOrder.inspectionType && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {selectedOrder.inspectionType}
                      </span>
                    )}
                  </div>
                  <div className="text-base text-gray-800 mb-0.5">{getStructureName(selectedOrder.structureId)}</div>
                  <div className="text-xs text-gray-500">{structure?.type} – {structure?.lt}</div>
                  <div className="text-xs text-gray-400 mt-0.5">OM: {selectedOrder.om || '—'}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                {[
                  { label: 'Técnico', value: techName, icon: Users },
                  { label: 'Supervisor', value: getTechnicianName(selectedOrder.supervisorId) || '—', icon: Users },
                  { label: 'Criado em', value: new Date(selectedOrder.createdAt).toLocaleDateString('pt-BR'), icon: Calendar },
                  { label: 'Concluído em', value: selectedOrder.completedAt ? new Date(selectedOrder.completedAt).toLocaleDateString('pt-BR') : '—', icon: CheckCircle2 },
                  { label: 'Prazo', value: new Date(selectedOrder.deadline).toLocaleDateString('pt-BR'), icon: Clock },
                  { label: 'Prioridade', value: selectedOrder.priority === 'alta' ? 'Alta' : selectedOrder.priority === 'media' ? 'Média' : 'Baixa', icon: AlertTriangle },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
                    </div>
                    <div className="text-xs text-gray-700">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Execution details */}
          {selectedOrder.type === 'execucao' && (
            <Card className="p-4 space-y-3">
              <h3 className="text-sm flex items-center gap-2" style={{ color: '#193A2A' }}>
                <FileText className="w-4 h-4" /> Detalhes do Serviço
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {selectedOrder.component && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Componente</div>
                    <div className="text-xs text-gray-700">{selectedOrder.component}</div>
                  </div>
                )}
                {selectedOrder.anomaly && (
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="text-[10px] text-red-400 uppercase tracking-wide mb-1">Anomalia</div>
                    <div className="text-xs text-red-700">{selectedOrder.anomaly}</div>
                  </div>
                )}
                {selectedOrder.description && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Descrição</div>
                    <div className="text-xs text-gray-700">{selectedOrder.description}</div>
                  </div>
                )}
                {selectedOrder.details && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Detalhes Técnicos</div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap">{selectedOrder.details}</div>
                  </div>
                )}
                {selectedOrder.supervisorNotes && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <div className="text-[10px] text-amber-600 uppercase tracking-wide mb-1">Observações do Supervisor</div>
                    <div className="text-xs text-amber-800">{selectedOrder.supervisorNotes}</div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Inspection results */}
          {selectedOrder.inspectionData && (
            <Card className="p-4">
              <h3 className="text-sm mb-3 flex items-center gap-2" style={{ color: '#193A2A' }}>
                <CheckCircle2 className="w-4 h-4" /> Resultado da Inspeção
              </h3>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { label: 'Total', value: selectedOrder.inspectionData.components.length, color: '#193A2A' },
                  { label: 'OK', value: okCount, color: '#16a34a' },
                  { label: 'Anomalias', value: anomCount, color: '#dc2626' },
                  { label: 'N/A', value: naCount, color: '#6b7280' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center bg-gray-50 rounded-lg py-3">
                    <div className="text-lg" style={{ color }}>{value}</div>
                    <div className="text-[10px] text-gray-400">{label}</div>
                  </div>
                ))}
              </div>

              {selectedOrder.inspectionData.generalNotes && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3">
                  <div className="text-[10px] text-amber-600 uppercase tracking-wide mb-1">Observações Gerais</div>
                  <div className="text-xs text-amber-800">{selectedOrder.inspectionData.generalNotes}</div>
                </div>
              )}

              {/* Anomalies */}
              {anomCount > 0 && (
                <div className="space-y-2 mb-3">
                  <div className="text-xs text-red-600 uppercase tracking-wide">Anomalias Detectadas</div>
                  {selectedOrder.inspectionData.components
                    .filter((c) => c.status === 'anomalia')
                    .flatMap((c) =>
                      c.anomalies.map((a) => (
                        <div key={a.id} className="bg-red-50 border border-red-100 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-800">
                                <span className="text-gray-500">{c.componentName}:</span> {a.anomalyName}
                              </div>
                              <div className="flex flex-wrap gap-2 mt-1">
                                <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-red-200 text-red-600">
                                  {a.severity}
                                </span>
                                <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-500">
                                  Fase {a.phase}
                                </span>
                                {a.requiresShutdown && (
                                  <span className="text-[10px] bg-orange-50 px-2 py-0.5 rounded border border-orange-200 text-orange-600">
                                    Req. Desligamento
                                  </span>
                                )}
                              </div>
                              {a.observation && (
                                <div className="text-[10px] text-gray-500 mt-1">{a.observation}</div>
                              )}
                              {a.photo && (
                                <img src={a.photo} alt="Foto anomalia" className="mt-2 w-full h-28 object-cover rounded" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                </div>
              )}

              {/* Component list */}
              <div className="space-y-1">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Todos os Componentes</div>
                {selectedOrder.inspectionData.components.map((comp) => (
                  <div
                    key={comp.componentId}
                    className="flex items-center justify-between py-2 px-3 rounded-lg"
                    style={{
                      backgroundColor:
                        comp.status === 'ok'
                          ? '#f0fdf4'
                          : comp.status === 'anomalia'
                          ? '#fef2f2'
                          : comp.status === 'nao-aplicavel'
                          ? '#f9fafb'
                          : '#fffde7',
                    }}
                  >
                    <span className="text-xs text-gray-700">{comp.componentName}</span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{
                        color:
                          comp.status === 'ok'
                            ? '#16a34a'
                            : comp.status === 'anomalia'
                            ? '#dc2626'
                            : '#6b7280',
                        backgroundColor: 'rgba(255,255,255,0.7)',
                      }}
                    >
                      {comp.status === 'ok'
                        ? '✓ OK'
                        : comp.status === 'anomalia'
                        ? '⚠ Anomalia'
                        : comp.status === 'nao-aplicavel'
                        ? 'N/A'
                        : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Photos */}
          {selectedPhotos.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm mb-3 flex items-center gap-2" style={{ color: '#193A2A' }}>
                <Camera className="w-4 h-4" /> Registros Fotográficos ({selectedPhotos.length})
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {selectedPhotos.map((p, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={p}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-28 object-cover rounded-lg border border-gray-100 cursor-pointer"
                      onClick={() => setViewingPhotoIndex(i)}
                    />
                    <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded">
                      {i + 1}/{selectedPhotos.length}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {viewingPhotoIndex !== null && (
            <PhotoLightbox
              photos={selectedPhotos}
              initialIndex={viewingPhotoIndex}
              onClose={() => setViewingPhotoIndex(null)}
              fileNamePrefix={selectedOrder.id}
            />
          )}

          {/* Activity log */}
          {selectedOrder.activityLog && selectedOrder.activityLog.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm mb-3 flex items-center gap-2" style={{ color: '#193A2A' }}>
                <Activity className="w-4 h-4" /> Histórico de Atividades
              </h3>
              <div className="space-y-2">
                {selectedOrder.activityLog.map((log, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#AA8933' }} />
                      {i < selectedOrder.activityLog!.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200" style={{ minHeight: '16px' }} />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="text-xs text-gray-700">{log.action}</div>
                      {log.details && <div className="text-[10px] text-gray-400">{log.details}</div>}
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(log.timestamp).toLocaleString('pt-BR')} · {log.userName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm" style={{ color: '#193A2A' }}>Ordens Concluídas</h2>
          <p className="text-xs text-gray-400">{filtered.length} de {completedOrders.length} encontradas</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
            {completedOrders.length} concluídas
          </span>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9 text-sm"
            placeholder="Buscar por estrutura, técnico, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 flex items-center gap-1.5"
          style={{ borderColor: hasFilters ? '#AA8933' : undefined, color: hasFilters ? '#AA8933' : undefined }}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          {hasFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-0.5" />
          )}
        </Button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Filtros Avançados</span>
            <button
              onClick={() => {
                setFilterType('all');
                setFilterTech('');
                setFilterStructure('');
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Limpar tudo
            </button>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Tipo de Ordem</label>
            <div className="flex gap-2">
              {(['all', 'inspecao', 'execucao'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className="flex-1 text-xs py-1.5 rounded-lg border-2 transition-all"
                  style={{
                    borderColor: filterType === t ? '#AA8933' : '#e5e7eb',
                    backgroundColor: filterType === t ? '#fff8e1' : '#fff',
                    color: filterType === t ? '#AA8933' : '#6b7280',
                  }}
                >
                  {t === 'all' ? 'Todos' : t === 'inspecao' ? 'Inspeção' : 'Execução'}
                </button>
              ))}
            </div>
          </div>

          {/* Technician */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Técnico</label>
            <select
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#AA8933]"
              value={filterTech}
              onChange={(e) => setFilterTech(e.target.value)}
            >
              <option value="">Todos os técnicos</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Concluído de</label>
              <Input
                type="date"
                className="text-sm"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Concluído até</label>
              <Input
                type="date"
                className="text-sm"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Order list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center shadow-sm">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">Nenhuma ordem concluída encontrada</p>
          {hasFilters && (
            <button
              onClick={() => {
                setFilterType('all');
                setFilterTech('');
                setFilterStructure('');
                setFilterDateFrom('');
                setFilterDateTo('');
                setSearch('');
              }}
              className="text-xs text-blue-500 mt-2 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => {
            const anomCount = order.inspectionData?.components.filter((c) => c.status === 'anomalia').length ?? 0;
            const photosCount = order.photos?.length ?? 0;
            return (
              <Card
                key={order.id}
                className="overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-all"
                onClick={() => setSelectedOrder(order)}
              >
                <div
                  className="h-1"
                  style={{ backgroundColor: order.type === 'inspecao' ? '#193A2A' : '#AA8933' }}
                />
                <div className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: order.type === 'inspecao' ? '#193A2A' : '#AA8933' }}
                        >
                          {order.type === 'inspecao' ? 'INSPEÇÃO' : 'EXECUÇÃO'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                          ✓ Concluído
                        </span>
                        {order.inspectionType && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            {order.inspectionType}
                          </span>
                        )}
                        {anomCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                            {anomCount} anomalia{anomCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-800 mb-0.5">
                        {getStructureName(order.structureId)}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-400">
                        <span>{order.om || '—'}</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {getTechnicianName(order.technicianId)}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          {order.completedAt
                            ? new Date(order.completedAt).toLocaleDateString('pt-BR')
                            : '—'}
                        </span>
                        {photosCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Camera className="w-3 h-3" />
                            {photosCount} foto{photosCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Download
                        className="w-4 h-4 text-gray-300 hover:text-gray-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          const structure = structures.find((s) => s.id === order.structureId);
                          generateOrderPDF(order, structure, getTechnicianName(order.technicianId));
                        }}
                      />
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}