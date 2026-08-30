import { useState, useEffect } from 'react';
import {
  ClipboardList,
  PlayCircle,
  Settings,
  LogOut,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  Camera,
  User as UserIcon,
  Lock,
  Info,
  MapPin,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import inspec360Icon from '../../assets/brand/inspec360-icon-white.png';
import grupoLogo from '../../assets/brand/grupo-mvv-bnmc.png';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { InspectionFlow } from './tecnico/InspectionFlow';
import { ExecutionFlow } from './tecnico/ExecutionFlow';
import {
  getStore,
  getPendingOrders,
  getActiveOrders,
  startOrder,
  getStructureById,
  updateUserProfile,
  generateId,
} from '../data/store';
import type { ServiceOrder } from '../data/types';
import type { User } from '../App';
import { forceSync } from '@/hooks/useDataSync';
import { useDataSync } from '@/hooks/useDataSync';

interface TecnicoAppProps {
  user: User;
  onLogout: () => void;
}

type Tab = 'tarefas' | 'iniciadas' | 'config';
type Screen =
  | { type: 'menu' }
  | { type: 'order-detail'; orderId: string }
  | { type: 'inspection'; orderId: string }
  | { type: 'execution'; orderId: string };

export function TecnicoApp({ user, onLogout }: TecnicoAppProps) {
  const [activeTab, setActiveTab] = useState<Tab>('tarefas');
  const [screen, setScreen] = useState<Screen>({ type: 'menu' });
  const [pendingOrders, setPendingOrders] = useState<ServiceOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<ServiceOrder[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' } | null>(null);
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'inspecao' | 'execucao'>('all');
  const [syncing, setSyncing] = useState(false);
  const { syncCounter } = useDataSync();

  // Settings state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(user.avatar);
  const [settingsSaved, setSettingsSaved] = useState(false);

  function refresh() {
    setPendingOrders(getPendingOrders(user.id));
    setActiveOrders(getActiveOrders(user.id));
  }

  useEffect(() => {
    refresh();
  }, [user.id, syncCounter]); // Re-render quando dados sincronizam

  async function handleForceSync() {
    setSyncing(true);
    const success = await forceSync();
    setSyncing(false);
    showToast(
      success ? '✅ Dados sincronizados com sucesso!' : '⚠️ Erro ao sincronizar. Tente novamente.',
      success ? 'success' : 'info'
    );
  }

  function showToast(msg: string, type: 'success' | 'info' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleStartOrder(orderId: string) {
    const updated = startOrder(orderId, user.id, user.name);
    if (updated) {
      refresh();
      if (updated.type === 'inspecao') {
        setScreen({ type: 'inspection', orderId });
      } else {
        setScreen({ type: 'execution', orderId });
      }
    }
  }

  function handleResumeOrder(orderId: string, orderType: 'inspecao' | 'execucao') {
    startOrder(orderId, user.id, user.name);
    refresh();
    if (orderType === 'inspecao') {
      setScreen({ type: 'inspection', orderId });
    } else {
      setScreen({ type: 'execution', orderId });
    }
  }

  function handleOrderComplete() {
    refresh();
    setScreen({ type: 'menu' });
    showToast('Ordem concluída com sucesso!');
  }

  function handleOrderPause() {
    refresh();
    setScreen({ type: 'menu' });
    setActiveTab('iniciadas');
    showToast('Progresso salvo. Ordem pausada.', 'info');
  }

  function handleBackFromOrder() {
    refresh();
    setScreen({ type: 'menu' });
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setAvatarPreview(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleSaveSettings() {
    if (newPassword && newPassword !== confirmPassword) {
      showToast('As senhas não coincidem.', 'info');
      return;
    }
    const updates: Record<string, string> = {};
    if (avatarPreview) updates.avatar = avatarPreview;
    if (newPassword) updates.password = newPassword;
    updateUserProfile(user.id, updates);
    setSettingsSaved(true);
    setNewPassword('');
    setConfirmPassword('');
    showToast('Configurações salvas!');
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  // ── Active order screens ─────────────────────────────────────────────────────
  if (screen.type === 'inspection') {
    const store = getStore();
    const order = store.serviceOrders.find((o) => o.id === screen.orderId);
    if (!order) { setScreen({ type: 'menu' }); return null; }
    return (
      <InspectionFlow
        order={order}
        user={user}
        onBack={handleBackFromOrder}
        onComplete={handleOrderComplete}
        onPause={handleOrderPause}
      />
    );
  }

  if (screen.type === 'execution') {
    const store = getStore();
    const order = store.serviceOrders.find((o) => o.id === screen.orderId);
    if (!order) { setScreen({ type: 'menu' }); return null; }
    return (
      <ExecutionFlow
        order={order}
        user={user}
        onBack={handleBackFromOrder}
        onComplete={handleOrderComplete}
        onPause={handleOrderPause}
      />
    );
  }

  // ── Priority badge ──────────────────────────────────────────────────────────
  function PriorityBadge({ priority }: { priority: string }) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      alta: { label: 'Alta', color: '#dc2626', bg: '#fee2e2' },
      media: { label: 'Média', color: '#AA8933', bg: '#fff8e1' },
      baixa: { label: 'Baixa', color: '#193A2A', bg: '#e8f5e9' },
    };
    const c = map[priority] || map.baixa;
    return (
      <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: c.color, backgroundColor: c.bg }}>
        {c.label}
      </span>
    );
  }

  // ── Order card ──────────────────────────────────────────────────────────────
  function OrderCard({
    order,
    showResume = false,
  }: {
    order: ServiceOrder;
    showResume?: boolean;
  }) {
    const structure = getStructureById(order.structureId);
    const isLate = new Date(order.deadline) < new Date();
    const isPaused = order.status === 'pausado';

    return (
      <Card className="overflow-hidden shadow-sm">
        {/* Type stripe */}
        <div
          className="h-1"
          style={{ backgroundColor: order.type === 'inspecao' ? '#193A2A' : '#AA8933' }}
        />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: order.type === 'inspecao' ? '#193A2A' : '#AA8933' }}
                >
                  {order.type === 'inspecao' ? 'Inspeção' : 'Execução'}
                </span>
                <PriorityBadge priority={order.priority} />
                {isPaused && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                    <Pause className="w-2.5 h-2.5" />
                    Pausada
                  </span>
                )}
              </div>
              <h3 className="text-sm" style={{ color: '#193A2A' }}>
                {structure ? structure.name : 'Estrutura não encontrada'}
              </h3>
              {structure && (
                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  <span>{structure.lt} – {structure.type}</span>
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-xs" style={{ color: isLate ? '#dc2626' : '#6b7280' }}>
                <Calendar className="w-3 h-3" />
                <span>{new Date(order.deadline).toLocaleDateString('pt-BR')}</span>
              </div>
              {isLate && (
                <div className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  Atrasado
                </div>
              )}
            </div>
          </div>

          {/* Execution details preview */}
          {order.type === 'execucao' && order.component && (
            <div className="mb-3 p-2 bg-gray-50 rounded-lg text-xs">
              <div className="text-gray-500">Componente: <span className="text-gray-700">{order.component}</span></div>
              {order.anomaly && (
                <div className="text-gray-500 mt-0.5">Anomalia: <span className="text-gray-700">{order.anomaly}</span></div>
              )}
            </div>
          )}

          {/* Inspection progress (if paused) */}
          {order.type === 'inspecao' && order.inspectionData && isPaused && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progresso da inspeção</span>
                <span>
                  {order.inspectionData.components.filter((c) => c.status !== 'pendente').length}/
                  {order.inspectionData.components.length}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${Math.round(
                      (order.inspectionData.components.filter((c) => c.status !== 'pendente').length /
                        order.inspectionData.components.length) *
                        100
                    )}%`,
                    backgroundColor: '#AA8933',
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {showResume ? (
              <Button
                size="sm"
                className="flex-1 text-white"
                style={{ backgroundColor: '#193A2A' }}
                onClick={() => handleResumeOrder(order.id, order.type)}
              >
                <Play className="w-4 h-4 mr-1.5" />
                Continuar
              </Button>
            ) : (
              <Button
                size="sm"
                className="flex-1 text-white"
                style={{ backgroundColor: '#AA8933' }}
                onClick={() => handleStartOrder(order.id)}
              >
                <Play className="w-4 h-4 mr-1.5" />
                Iniciar
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setScreen({ type: 'order-detail', orderId: order.id })}
            >
              <Info className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // ── Order Detail screen ──────────────────────────────────────────────────────
  if (screen.type === 'order-detail') {
    const store = getStore();
    const order = store.serviceOrders.find((o) => o.id === screen.orderId);
    if (!order) { setScreen({ type: 'menu' }); return null; }
    const structure = getStructureById(order.structureId);
    const isPaused = order.status === 'pausado';
    const isPending = order.status === 'pendente';

    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#f5f5f5' }}>
        <div className="sticky top-0 z-10 shadow-sm" style={{ backgroundColor: '#193A2A' }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => setScreen({ type: 'menu' })} className="text-white">
              <ChevronRight className="w-6 h-6 rotate-180" />
            </button>
            <div className="text-white text-sm">
              {order.type === 'inspecao' ? 'Inspeção' : 'Execução'} – Detalhes
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 pb-32 space-y-4">
          {structure && (
            <Card className="p-4">
              <div className="text-xs text-gray-500 mb-1">Estrutura</div>
              <div className="text-base" style={{ color: '#193A2A' }}>{structure.name}</div>
              <div className="text-xs text-gray-500">{structure.type} – {structure.lt}</div>
              <div className="text-xs text-gray-500 mt-1">
                Tensão: {structure.voltage} | Progressiva: {structure.progressiva.toLocaleString('pt-BR')} m
              </div>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            {order.component && (
              <div>
                <div className="text-xs text-gray-500">Componente</div>
                <div className="text-sm">{order.component}</div>
              </div>
            )}
            {order.anomaly && (
              <div>
                <div className="text-xs text-gray-500">Anomalia</div>
                <div className="text-sm">{order.anomaly}</div>
              </div>
            )}
            {order.description && (
              <div>
                <div className="text-xs text-gray-500">Descrição</div>
                <div className="text-sm">{order.description}</div>
              </div>
            )}
            {order.details && (
              <div>
                <div className="text-xs text-gray-500">Detalhes</div>
                <div className="text-sm">{order.details}</div>
              </div>
            )}
            {order.supervisorNotes && (
              <div>
                <div className="text-xs text-gray-500">Observações Supervisor</div>
                <div className="text-sm">{order.supervisorNotes}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-gray-500">Prazo</div>
              <div className="text-sm">{new Date(order.deadline).toLocaleDateString('pt-BR')}</div>
            </div>
          </Card>

          {/* Activity log */}
          {order.activityLog && order.activityLog.length > 0 && (
            <Card className="p-4">
              <div className="text-xs text-gray-500 mb-2">Histórico</div>
              <div className="space-y-2">
                {order.activityLog.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#AA8933' }} />
                    <div>
                      <span className="text-gray-700">{log.action}</span>
                      <span className="text-gray-400 ml-1">
                        – {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3">
          {(isPending || isPaused) && (
            <Button
              className="w-full text-white"
              style={{ backgroundColor: '#AA8933' }}
              onClick={() => handleStartOrder(order.id)}
            >
              <Play className="w-4 h-4 mr-2" />
              {isPaused ? 'Continuar' : 'Iniciar'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Main menu ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#f5f5f5' }}>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-4 right-4 z-50 rounded-xl px-4 py-3 shadow-lg text-white text-sm text-center transition-all`}
          style={{ backgroundColor: toast.type === 'success' ? '#193A2A' : '#AA8933' }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 shadow-md" style={{ backgroundColor: '#193A2A' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src={inspec360Icon} alt="" className="h-8 w-8" />
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-white text-[15px] tracking-wide leading-none">
                INSPEC<span style={{ color: '#AA8933' }}>360</span>
              </span>
              <span className="text-white/60 text-[9px] uppercase tracking-wide leading-none">Linha de Transmissão</span>
            </div>
            <div className="w-px h-6 bg-white/15 hidden sm:block" />
            <img src={grupoLogo} alt="Mineração Vale Verde · BNMC" className="h-6 w-auto rounded hidden sm:block" />
          </div>
          <div className="flex-1 px-3">
            <div className="text-white text-xs opacity-75">Técnico</div>
            <div className="text-white text-sm">{user.name}</div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleForceSync}
            disabled={syncing}
            className="text-white hover:bg-white/10"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout} className="text-white hover:bg-white/10">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 pb-20 overflow-y-auto">
        {/* ── Tarefas tab ──────────────────────────────────────────────────── */}
        {activeTab === 'tarefas' && (() => {
          const filtered = orderTypeFilter === 'all'
            ? pendingOrders
            : pendingOrders.filter((o) => o.type === orderTypeFilter);
          return (
            <div className="p-4 space-y-4">
              {/* Summary chips */}
              <div className="flex gap-2">
                <div className="flex-1 bg-white rounded-xl p-3 shadow-sm text-center">
                  <div className="text-xl" style={{ color: '#193A2A' }}>{pendingOrders.length}</div>
                  <div className="text-xs text-gray-500">Pendentes</div>
                </div>
                <div className="flex-1 bg-white rounded-xl p-3 shadow-sm text-center">
                  <div className="text-xl" style={{ color: '#AA8933' }}>{activeOrders.length}</div>
                  <div className="text-xs text-gray-500">Em andamento</div>
                </div>
                <div className="flex-1 bg-white rounded-xl p-3 shadow-sm text-center">
                  <div className="text-xl" style={{ color: '#dc2626' }}>
                    {pendingOrders.filter((o) => new Date(o.deadline) < new Date()).length}
                  </div>
                  <div className="text-xs text-gray-500">Atrasadas</div>
                </div>
              </div>

              {/* Filter toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Filtrar:</span>
                <div className="flex gap-1 flex-1">
                  {([
                    { id: 'all', label: 'Todas' },
                    { id: 'inspecao', label: '🔍 Inspeção' },
                    { id: 'execucao', label: '⚙️ Execução' },
                  ] as const).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setOrderTypeFilter(f.id)}
                      className="flex-1 text-xs py-1.5 px-2 rounded-lg border transition-all"
                      style={{
                        borderColor: orderTypeFilter === f.id ? '#AA8933' : '#e5e7eb',
                        backgroundColor: orderTypeFilter === f.id ? '#fff8e1' : '#fff',
                        color: orderTypeFilter === f.id ? '#AA8933' : '#6b7280',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: '#193A2A' }} />
                  <h3 className="text-sm" style={{ color: '#193A2A' }}>
                    {orderTypeFilter === 'all' ? 'Sem tarefas pendentes' : `Sem ${orderTypeFilter === 'inspecao' ? 'inspeções' : 'execuções'} pendentes`}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Você está em dia com suas atividades.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h2 className="text-xs text-gray-500 uppercase tracking-wide px-1">
                    Ordens Pendentes {orderTypeFilter !== 'all' && `– ${orderTypeFilter === 'inspecao' ? 'Inspeção' : 'Execução'}`}
                  </h2>
                  {filtered.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Tarefas Iniciadas tab ─────────────────────────────────────── */}
        {activeTab === 'iniciadas' && (
          <div className="p-4 space-y-4">
            {activeOrders.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-sm text-gray-500">Nenhuma tarefa em andamento</h3>
                <p className="text-xs text-gray-400 mt-1">
                  As ordens iniciadas ou pausadas aparecem aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-xs text-gray-500 uppercase tracking-wide px-1">
                  Em Andamento / Pausadas
                </h2>
                {activeOrders.map((order) => (
                  <OrderCard key={order.id} order={order} showResume />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Configurações tab ────────────────────────────────────────── */}
        {activeTab === 'config' && (
          <div className="p-4 space-y-4">
            {/* Avatar */}
            <Card className="p-4">
              <h3 className="text-sm mb-3" style={{ color: '#193A2A' }}>Foto de Perfil</h3>
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center"
                  style={{ backgroundColor: '#193A2A' }}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-8 h-8 text-white" />
                  )}
                </div>
                <div>
                  <label className="cursor-pointer">
                    <span
                      className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg text-white"
                      style={{ backgroundColor: '#AA8933' }}
                    >
                      <Camera className="w-4 h-4" />
                      Alterar foto
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-1">JPG, PNG (máx. 2MB)</p>
                </div>
              </div>
            </Card>

            {/* User info */}
            <Card className="p-4 space-y-3">
              <h3 className="text-sm" style={{ color: '#193A2A' }}>Informações da Conta</h3>
              <div>
                <div className="text-xs text-gray-500">Nome</div>
                <div className="text-sm">{user.name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">E-mail</div>
                <div className="text-sm">{user.email}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Perfil</div>
                <div className="text-sm">Técnico de Campo</div>
              </div>
            </Card>

            {/* Change password */}
            <Card className="p-4 space-y-3">
              <h3 className="text-sm flex items-center gap-2" style={{ color: '#193A2A' }}>
                <Lock className="w-4 h-4" />
                Alterar Senha
              </h3>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Nova senha</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Confirmar nova senha</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button
                className="w-full text-white"
                style={{ backgroundColor: '#193A2A' }}
                onClick={handleSaveSettings}
              >
                {settingsSaved ? <><CheckCircle2 className="w-4 h-4 mr-2" />Salvo!</> : 'Salvar alterações'}
              </Button>
            </Card>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
        <div className="flex">
          {(
            [
              { id: 'tarefas', label: 'Tarefas', icon: ClipboardList, badge: pendingOrders.length },
              { id: 'iniciadas', label: 'Em Andamento', icon: PlayCircle, badge: activeOrders.length },
              { id: 'config', label: 'Configurações', icon: Settings, badge: 0 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex flex-col items-center py-2 gap-0.5 relative"
              >
                <div className="relative">
                  <Icon
                    className="w-5 h-5"
                    style={{ color: active ? '#AA8933' : '#9ca3af' }}
                  />
                  {tab.badge > 0 && (
                    <span
                      className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center"
                      style={{ backgroundColor: '#dc2626' }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px]"
                  style={{ color: active ? '#AA8933' : '#9ca3af' }}
                >
                  {tab.label}
                </span>
                {active && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                    style={{ backgroundColor: '#AA8933' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}