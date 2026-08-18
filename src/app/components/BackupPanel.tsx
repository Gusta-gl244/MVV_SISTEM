import { useState, useEffect } from 'react';
import {
  Download,
  Upload,
  Trash2,
  Database,
  CheckCircle2,
  AlertTriangle,
  Clock,
  HardDrive,
  Settings2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { getStore } from '@/app/data/store';
import { runSyncCycle } from '@/sync/engine';
import type { AppData } from '@/app/data/types';
import * as api from '@/api/client';
import {
  exportDataAsJSON,
  exportStructuresAsCSV,
  exportServiceOrdersAsCSV,
  downloadFile,
  downloadBlob,
  importDataFromFile,
  formatFileSize,
  formatDate,
} from '@/utils/backupManager';

interface BackupPanelProps {
  onClose: () => void;
}

type BackupTab = 'export' | 'backups' | 'automatico' | 'restore';

interface BackupMeta {
  id: string;
  createdAt: string;
  kind: 'manual' | 'scheduled';
  sizeBytes: number;
}

interface ScheduleConfig {
  enabled: boolean;
  intervalHours: number;
  retentionCount: number;
}

export function BackupPanel({ onClose }: BackupPanelProps) {
  const [activeTab, setActiveTab] = useState<BackupTab>('export');
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [schedule, setSchedule] = useState<ScheduleConfig>({ enabled: false, intervalHours: 24, retentionCount: 10 });
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshBackupsList = async () => {
    try {
      setBackups(await api.backupsAPI.list());
    } catch {
      // backend indisponível — lista fica vazia
    }
  };

  useEffect(() => {
    refreshBackupsList();
    api.backupsAPI.getSchedule().then(setSchedule).catch(() => {});
  }, []);

  // Busca o estado mais recente do servidor antes de qualquer exportação
  // local — nunca confiar só no que este dispositivo tem em cache no momento.
  const getFreshStore = async (): Promise<AppData> => {
    await runSyncCycle();
    return getStore();
  };

  const handleExportJSON = async () => {
    try {
      setIsProcessing(true);
      const store = await getFreshStore();
      downloadFile(exportDataAsJSON(store), `inspec360_dados_${new Date().toISOString().split('T')[0]}.json`, 'json');
      showToast('Dados exportados com sucesso!');
    } catch (error) {
      showToast(`Erro ao exportar: ${error}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportStructuresCSV = async () => {
    try {
      setIsProcessing(true);
      const store = await getFreshStore();
      downloadFile(exportStructuresAsCSV(store), `inspec360_estruturas_${new Date().toISOString().split('T')[0]}.csv`, 'csv');
      showToast('Estruturas exportadas com sucesso!');
    } catch (error) {
      showToast(`Erro ao exportar: ${error}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportOrdersCSV = async () => {
    try {
      setIsProcessing(true);
      const store = await getFreshStore();
      downloadFile(exportServiceOrdersAsCSV(store), `inspec360_ordens_${new Date().toISOString().split('T')[0]}.csv`, 'csv');
      showToast('Ordens de serviço exportadas com sucesso!');
    } catch (error) {
      showToast(`Erro ao exportar: ${error}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunBackupNow = async () => {
    try {
      setIsProcessing(true);
      await api.backupsAPI.run();
      await refreshBackupsList();
      showToast('Backup gerado com sucesso!');
    } catch (error) {
      showToast(`Erro ao gerar backup: ${error instanceof Error ? error.message : error}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadBackup = async (backup: BackupMeta) => {
    try {
      setIsProcessing(true);
      const blob = await api.backupsAPI.download(backup.id);
      downloadBlob(blob, `inspec360_backup_${backup.createdAt.slice(0, 10)}_${backup.id.slice(0, 8)}.zip`);
    } catch (error) {
      showToast(`Erro ao baixar backup: ${error}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteBackup = async (backup: BackupMeta) => {
    if (!confirm('Tem certeza que deseja excluir este backup do servidor?')) return;
    try {
      await api.backupsAPI.remove(backup.id);
      await refreshBackupsList();
      showToast('Backup excluído.');
    } catch (error) {
      showToast(`Erro ao excluir backup: ${error}`, 'error');
    }
  };

  const handleSaveSchedule = async (next: ScheduleConfig) => {
    try {
      setIsProcessing(true);
      const saved = await api.backupsAPI.setSchedule(next);
      setSchedule(saved);
      showToast(saved.enabled ? 'Backup automático ativado!' : 'Backup automático desativado.');
    } catch (error) {
      showToast(`Erro ao salvar configuração: ${error}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const data = await importDataFromFile(file);
      const structures = Array.isArray(data) ? data : (data as any)?.structures;
      if (!Array.isArray(structures)) {
        throw new Error('Formato não suportado. Use um array de estruturas ou um JSON com a chave "structures".');
      }
      const response = await api.structuresAPI.importMany(structures);
      const imported = response?.imported ?? response?.structures?.length ?? structures.length;
      showToast(`${imported} estruturas importadas! Recarregando...`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      showToast(`Erro ao importar: ${error instanceof Error ? error.message : error}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white">
        <div className="bg-gradient-to-r from-[#193A2A] to-[#2a5242] p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Centro de Backup e Exportação</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">✕</button>
        </div>

        <div className="flex border-b bg-gray-50">
          {[
            { id: 'export', label: '📥 Exportar' },
            { id: 'backups', label: '💾 Backups do Servidor' },
            { id: 'automatico', label: '⚙️ Automático' },
            { id: 'restore', label: '📁 Importar Estruturas' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as BackupTab)}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition ${
                activeTab === tab.id ? 'text-[#193A2A] border-b-2 border-[#193A2A]' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'export' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                <div className="text-blue-600 mt-1">ℹ️</div>
                <div>
                  <p className="font-semibold text-blue-900">Exportação Rápida</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Baixa a cópia local mais recente (já sincronizada com o servidor) em JSON ou CSV. Para um backup completo com as fotos como arquivos, use a aba "Backups do Servidor".
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <Card className="p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-[#193A2A] flex items-center gap-2"><Download className="w-5 h-5" />Exportar Dados (JSON)</h3>
                      <p className="text-gray-600 text-sm mt-2">Usuários, estruturas, ordens, inspeções e execuções em um único arquivo.</p>
                    </div>
                    <Button onClick={handleExportJSON} disabled={isProcessing} className="bg-[#193A2A] hover:bg-[#2a5242] text-white whitespace-nowrap">
                      {isProcessing ? 'Processando...' : 'Exportar JSON'}
                    </Button>
                  </div>
                </Card>
                <Card className="p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-[#193A2A] flex items-center gap-2"><Download className="w-5 h-5" />Exportar Estruturas (CSV)</h3>
                      <p className="text-gray-600 text-sm mt-2">Lista de torres para análise em Excel.</p>
                    </div>
                    <Button onClick={handleExportStructuresCSV} disabled={isProcessing} className="bg-[#193A2A] hover:bg-[#2a5242] text-white whitespace-nowrap">
                      {isProcessing ? 'Processando...' : 'Exportar CSV'}
                    </Button>
                  </div>
                </Card>
                <Card className="p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-[#193A2A] flex items-center gap-2"><Download className="w-5 h-5" />Exportar Ordens de Serviço (CSV)</h3>
                      <p className="text-gray-600 text-sm mt-2">Todas as ordens de trabalho para relatórios.</p>
                    </div>
                    <Button onClick={handleExportOrdersCSV} disabled={isProcessing} className="bg-[#193A2A] hover:bg-[#2a5242] text-white whitespace-nowrap">
                      {isProcessing ? 'Processando...' : 'Exportar CSV'}
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'backups' && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-900">Backup Completo</p>
                  <p className="text-sm text-green-700 mt-1">
                    Gera um ZIP com todos os dados (JSON por tabela) e as fotos de campo como arquivos de imagem reais, organizados por ordem/inspeção. Fica guardado no banco do servidor — sobrevive a redeploys.
                  </p>
                </div>
              </div>

              <Button onClick={handleRunBackupNow} disabled={isProcessing} className="w-full bg-green-600 hover:bg-green-700 text-white">
                {isProcessing ? 'Gerando backup...' : '💾 Gerar Backup Agora'}
              </Button>

              {backups.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Backups disponíveis ({backups.length})</p>
                  {backups.map((backup) => (
                    <div key={backup.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          {formatDate(backup.createdAt)}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">{backup.kind === 'manual' ? 'manual' : 'automático'}</span>
                        </p>
                        <p className="text-sm text-gray-600 mt-1"><HardDrive className="w-4 h-4 inline mr-1" />{formatFileSize(backup.sizeBytes)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleDownloadBackup(backup)} disabled={isProcessing} className="text-blue-600 border-blue-600 hover:bg-blue-50">
                          <Download className="w-4 h-4 mr-1" />Baixar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteBackup(backup)} disabled={isProcessing} className="text-red-600 border-red-600 hover:bg-red-50">
                          <Trash2 className="w-4 h-4 mr-1" />Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum backup gerado ainda</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'automatico' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                <Settings2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-900">Backup Automático</p>
                  <p className="text-sm text-blue-700 mt-1">O servidor gera um backup completo sozinho, no intervalo configurado, e apaga os mais antigos além da retenção definida.</p>
                </div>
              </div>

              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#193A2A]">Ativar backup automático</p>
                    <p className="text-xs text-gray-500">Roda em segundo plano no servidor, mesmo com ninguém logado.</p>
                  </div>
                  <button
                    onClick={() => handleSaveSchedule({ ...schedule, enabled: !schedule.enabled })}
                    disabled={isProcessing}
                    className={`w-12 h-7 rounded-full transition-colors relative ${schedule.enabled ? 'bg-green-600' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-transform ${schedule.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Intervalo (horas)</label>
                    <select
                      value={schedule.intervalHours}
                      onChange={(e) => setSchedule((s) => ({ ...s, intervalHours: Number(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      {[1, 2, 6, 12, 24].map((h) => <option key={h} value={h}>{h === 24 ? 'Diariamente (03:00)' : `A cada ${h}h`}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Manter últimos</label>
                    <select
                      value={schedule.retentionCount}
                      onChange={(e) => setSchedule((s) => ({ ...s, retentionCount: Number(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      {[5, 10, 20, 30].map((n) => <option key={n} value={n}>{n} backups</option>)}
                    </select>
                  </div>
                </div>

                <Button onClick={() => handleSaveSchedule(schedule)} disabled={isProcessing} className="w-full bg-[#193A2A] hover:bg-[#2a5242] text-white">
                  Salvar Configuração
                </Button>
              </Card>
            </div>
          )}

          {activeTab === 'restore' && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900">Importar Estruturas</p>
                  <p className="text-sm text-amber-700 mt-1">Aceita um arquivo JSON com um array de estruturas, ou um objeto com a chave "structures". Estruturas novas são adicionadas ao banco.</p>
                </div>
              </div>

              <Card className="p-6 border-dashed border-2">
                <div className="text-center py-12">
                  <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-700 font-semibold mb-4">Selecionar Arquivo JSON</p>
                  <label className="inline-block">
                    <input type="file" accept=".json" onChange={handleImportFile} disabled={isProcessing} className="hidden" />
                    <Button as="span" className="bg-[#193A2A] hover:bg-[#2a5242] text-white cursor-pointer" disabled={isProcessing}>
                      {isProcessing ? 'Importando...' : '📁 Selecionar Arquivo'}
                    </Button>
                  </label>
                </div>
              </Card>
            </div>
          )}
        </div>

        {toast && (
          <div className={`border-t px-6 py-3 flex items-center gap-3 ${
            toast.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' :
            toast.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' :
            'bg-blue-50 text-blue-800 border-blue-200'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : toast.type === 'error' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <Clock className="w-5 h-5 flex-shrink-0" />}
            <span>{toast.msg}</span>
          </div>
        )}
      </Card>
    </div>
  );
}
