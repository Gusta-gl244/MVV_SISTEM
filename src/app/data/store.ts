import type {
  AppData,
  SystemUser,
  Structure,
  ServiceOrder,
  InspectionData,
  ComponentRule,
  SeverityOption,
  SystemLog,
  InspectionRecord,
  ExecutionRecord,
} from './types';
import { INITIAL_INSPECTION_COMPONENTS } from './checklistRules';
import { isUtmCoord, utmToLatLng } from '@/utils/coordinateUtils';
import { STORAGE_KEY, TOKEN_KEY } from './constants';
import { enqueueMutation, runSyncCycle } from '@/sync/engine';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const LOG_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Helpers de Storage ──────────────────────────────────────────────────────

export function getStore(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (!parsed.checklistComponents) parsed.checklistComponents = [];
      if (!parsed.severities) parsed.severities = [];
      if (!parsed.systemLogs) parsed.systemLogs = [];
      if (!parsed.logsLastReset) parsed.logsLastReset = new Date().toISOString();
      if (!parsed.inspectionRecords) parsed.inspectionRecords = [];
      if (!parsed.executionRecords) parsed.executionRecords = [];
      parsed.structures = (parsed.structures ?? []).map((s) => ({
        ...s,
        coordX: s.coordX ?? (s.lng ?? 0),
        coordY: s.coordY ?? (s.lat ?? 0),
      }));
      return parsed;
    }
  } catch {
    // corrompido – resetar
  }
  return getInitialData();
}

/**
 * Grava a cópia local (localStorage) e notifica os componentes. Não fala com
 * o servidor diretamente — quem chama é responsável por também enfileirar a
 * mutação específica via enqueueMutation() quando o que mudou precisa ser
 * sincronizado (a maioria dos casos; logs locais são a exceção).
 */
export function saveStore(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { timestamp: Date.now(), source: 'local-write' } }));
  } catch (err) {
    console.error('[Storage] Falha ao gravar localmente:', err);
  }
}

/**
 * Hidratação inicial: roda um ciclo completo de sincronização (drena
 * qualquer mutação pendente de uma sessão anterior, depois busca tudo do
 * servidor) antes da UI renderizar de verdade. Mantido com este nome por
 * compatibilidade com o App.tsx existente.
 */
export async function loadFromBackend(): Promise<void> {
  await runSyncCycle();
}

export function getInitialData(): AppData {
  // Tudo começa vazio de propósito — nenhum dado de exemplo é semeado aqui.
  // O catálogo real de componentes/severidades vem do servidor (importado
  // da planilha de referência) assim que o primeiro pull autenticado
  // completa. Semear com um catálogo genérico aqui já causou duplicação
  // permanente no passado: como o pull mescla por id, um componente
  // genérico local (id "fundacao") nunca é substituído pelo real do
  // servidor (id gerado) — os dois ficam somados para sempre.
  return {
    users: [],
    structures: [],
    serviceOrders: [],
    activityLog: [],
    checklistComponents: [],
    severities: [],
    inspectionRecords: [],
    executionRecords: [],
    systemLogs: [],
    logsLastReset: new Date().toISOString(),
  };
}

export function resetStore(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function refreshCurrentData(): void {
  window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { timestamp: Date.now() } }));
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function authenticate(email: string, password: string): Promise<SystemUser | null> {
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const { token, user } = await res.json();
    localStorage.setItem(TOKEN_KEY, token);

    // Garante que o usuário autenticado já está na cópia local, mesmo antes
    // do primeiro pull completar (ex.: primeiro login neste dispositivo).
    const store = getStore();
    const idx = store.users.findIndex((u) => u.id === user.id);
    const merged: SystemUser = { ...(idx >= 0 ? store.users[idx] : {}), ...user, password: '' } as SystemUser;
    if (idx >= 0) store.users[idx] = merged;
    else store.users.push(merged);
    saveStore(store);

    runSyncCycle().catch(() => {});
    return merged;
  } catch (err) {
    console.error('[Auth] Falha no login:', err);
    return null;
  }
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Ordens helpers ──────────────────────────────────────────────────────────

export function getOrdersByTechnician(technicianId: string): ServiceOrder[] {
  return getStore().serviceOrders.filter((o) => o.technicianId === technicianId);
}

export function getPendingOrders(technicianId: string): ServiceOrder[] {
  return getOrdersByTechnician(technicianId).filter((o) => o.status === 'pendente');
}

export function getActiveOrders(technicianId: string): ServiceOrder[] {
  return getOrdersByTechnician(technicianId).filter((o) => o.status === 'em-andamento' || o.status === 'pausado');
}

export function getStructureById(id: string): Structure | undefined {
  return getStore().structures.find((s) => s.id === id);
}

export function getUserById(id: string): SystemUser | undefined {
  return getStore().users.find((u) => u.id === id);
}

function syncOrder(order: ServiceOrder) {
  enqueueMutation('serviceOrders', 'update', order.id, order);
}
function syncInspectionRecord(rec: InspectionRecord) {
  enqueueMutation('inspectionRecords', rec.id ? 'update' : 'create', rec.id, rec);
}
function syncExecutionRecord(rec: ExecutionRecord) {
  enqueueMutation('executionRecords', rec.id ? 'update' : 'create', rec.id, rec);
}

export function startOrder(orderId: string, userId: string, userName: string): ServiceOrder | null {
  const store = getStore();
  const order = store.serviceOrders.find((o) => o.id === orderId);
  if (!order) return null;

  const now = new Date().toISOString();
  const isFirstStart = !order.startedAt;
  order.status = 'em-andamento';
  order.startedAt = order.startedAt || now;
  order.resumedAt = now;

  if (order.type === 'inspecao' && !order.inspectionData) {
    const components = (store.checklistComponents ?? INITIAL_INSPECTION_COMPONENTS).map((c) => ({
      componentId: c.id,
      componentName: c.name,
      status: 'pendente' as const,
      anomalies: [],
    }));
    order.inspectionData = { currentComponentIndex: 0, components, startedAt: now };
  }

  if (!order.activityLog) order.activityLog = [];
  order.activityLog.push({
    timestamp: now, userId, userName,
    action: isFirstStart ? 'Ordem iniciada' : 'Ordem retomada',
    details: 'Status: em andamento',
  });

  if (order.type === 'inspecao') {
    if (!store.inspectionRecords) store.inspectionRecords = [];
    let inspRec = store.inspectionRecords.find((r) => r.orderId === orderId);
    if (!inspRec) {
      const structure = store.structures.find((s) => s.id === order.structureId);
      const supervisor = store.users.find((u) => u.id === order.supervisorId);
      inspRec = {
        id: `insp_${generateId()}`,
        orderId,
        estruturaId: order.structureId,
        estruturaNome: structure?.name || order.structureId,
        supervisorId: order.supervisorId,
        supervisorNome: supervisor?.name || order.supervisorId,
        tecnicoId: userId,
        tecnicoNome: userName,
        dataHoraAbertura: now,
        status: 'em-andamento',
        components: (store.checklistComponents ?? INITIAL_INSPECTION_COMPONENTS).map((c) => ({
          componentId: c.id, componentName: c.name, status: 'pendente' as const, anomalies: [],
        })),
        historicoPausas: [],
        photos: [],
      };
      store.inspectionRecords.push(inspRec);
      order.inspectionRecordId = inspRec.id;
    } else {
      inspRec.status = 'em-andamento';
      const lastPause = inspRec.historicoPausas[inspRec.historicoPausas.length - 1];
      if (lastPause && !lastPause.resumedAt) lastPause.resumedAt = now;
    }
    syncInspectionRecord(inspRec);
  }

  if (order.type === 'execucao') {
    if (!store.executionRecords) store.executionRecords = [];
    let execRec = store.executionRecords.find((r) => r.orderId === orderId);
    if (!execRec) {
      const structure = store.structures.find((s) => s.id === order.structureId);
      const supervisor = store.users.find((u) => u.id === order.supervisorId);
      execRec = {
        id: `exec_${generateId()}`,
        orderId, estruturaId: order.structureId, estruturaNome: structure?.name || order.structureId,
        supervisorId: order.supervisorId, supervisorNome: supervisor?.name || order.supervisorId,
        tecnicoId: userId, tecnicoNome: userName,
        componente: order.component || '', anomalia: order.anomaly || '',
        descricao: order.description, detalhes: order.details,
        prazoRegras: order.deadlineRules, notasSupervisor: order.supervisorNotes,
        dataHoraAbertura: order.createdAt, dataHoraExecucaoInicio: now,
        status: 'em-andamento', historicoPausas: [], photos: [],
      };
      store.executionRecords.push(execRec);
      order.executionRecordId = execRec.id;
    } else {
      execRec.status = 'em-andamento';
      if (!execRec.dataHoraExecucaoInicio) execRec.dataHoraExecucaoInicio = now;
      const lastPause = execRec.historicoPausas[execRec.historicoPausas.length - 1];
      if (lastPause && !lastPause.resumedAt) lastPause.resumedAt = now;
    }
    syncExecutionRecord(execRec);
  }

  addSystemLog({ level: 'info', module: 'Ordens', message: `Ordem ${orderId} iniciada por ${userName}`, userId, userName });
  saveStore(store);
  syncOrder(order);
  return order;
}

export function pauseOrder(orderId: string, userId: string, userName: string, motivo?: string): ServiceOrder | null {
  const store = getStore();
  const order = store.serviceOrders.find((o) => o.id === orderId);
  if (!order) return null;

  const now = new Date().toISOString();
  order.status = 'pausado';
  order.pausedAt = now;

  if (!order.activityLog) order.activityLog = [];
  order.activityLog.push({ timestamp: now, userId, userName, action: 'Ordem pausada', details: motivo || 'Pausado pelo técnico' });

  if (order.type === 'inspecao' && store.inspectionRecords) {
    const inspRec = store.inspectionRecords.find((r) => r.orderId === orderId);
    if (inspRec) {
      inspRec.status = 'pausado';
      inspRec.historicoPausas.push({ pausedAt: now, motivo, userId, userName });
      syncInspectionRecord(inspRec);
    }
  }
  if (order.type === 'execucao' && store.executionRecords) {
    const execRec = store.executionRecords.find((r) => r.orderId === orderId);
    if (execRec) {
      execRec.status = 'pausado';
      execRec.historicoPausas.push({ pausedAt: now, motivo, userId, userName });
      syncExecutionRecord(execRec);
    }
  }

  addSystemLog({ level: 'info', module: 'Ordens', message: `Ordem ${orderId} pausada por ${userName}`, userId, userName });
  saveStore(store);
  syncOrder(order);
  return order;
}

export function completeOrder(orderId: string, userId: string, userName: string): ServiceOrder | null {
  const store = getStore();
  const order = store.serviceOrders.find((o) => o.id === orderId);
  if (!order) return null;

  const now = new Date().toISOString();
  order.status = 'concluido';
  order.completedAt = now;
  if (order.inspectionData) order.inspectionData.completedAt = now;

  if (!order.activityLog) order.activityLog = [];
  order.activityLog.push({ timestamp: now, userId, userName, action: 'Ordem concluída', details: 'Atividade finalizada pelo técnico' });

  const structure = store.structures.find((s) => s.id === order.structureId);
  if (structure) {
    const hasAnomalies = order.inspectionData?.components.some((c) => c.status === 'anomalia');
    structure.status = hasAnomalies ? 'anomalia' : 'concluido';
    enqueueMutation('structures', 'update', structure.id, structure);
  }

  if (order.type === 'inspecao' && store.inspectionRecords) {
    const inspRec = store.inspectionRecords.find((r) => r.orderId === orderId);
    if (inspRec) {
      inspRec.status = 'concluido';
      inspRec.dataHoraFim = now;
      if (order.inspectionData) inspRec.components = order.inspectionData.components;
      syncInspectionRecord(inspRec);
    }
  }
  if (order.type === 'execucao' && store.executionRecords) {
    const execRec = store.executionRecords.find((r) => r.orderId === orderId);
    if (execRec) {
      execRec.status = 'concluido';
      execRec.dataHoraExecucaoFim = now;
      execRec.dataHoraFim = now;
      syncExecutionRecord(execRec);
    }
  }

  addSystemLog({ level: 'success', module: 'Ordens', message: `Ordem ${orderId} concluída por ${userName}`, userId, userName });
  saveStore(store);
  syncOrder(order);
  return order;
}

export function saveInspectionProgress(orderId: string, inspectionData: InspectionData): void {
  const store = getStore();
  const order = store.serviceOrders.find((o) => o.id === orderId);
  if (!order) return;
  order.inspectionData = inspectionData;
  if (store.inspectionRecords) {
    const inspRec = store.inspectionRecords.find((r) => r.orderId === orderId);
    if (inspRec) {
      inspRec.components = inspectionData.components;
      syncInspectionRecord(inspRec);
    }
  }
  saveStore(store);
  syncOrder(order);
}

/**
 * Substitui a lista completa de fotos gerais de uma ordem (usado pelo fluxo
 * de execução, onde o PhotoManager entrega o array inteiro após cada
 * captura/remoção).
 */
export function updateOrderPhotos(orderId: string, photos: string[]): void {
  const store = getStore();
  const order = store.serviceOrders.find((o) => o.id === orderId);
  if (!order) return;
  order.photos = photos;
  saveStore(store);
  syncOrder(order);
}

// ─── Supervisor helpers ──────────────────────────────────────────────────────

function fillStructureCoordinates(structure: Structure): Structure {
  if (structure.coordX != null && structure.coordY != null && isUtmCoord(structure.coordX, structure.coordY)) {
    const geo = utmToLatLng(structure.coordX, structure.coordY);
    structure.lat = geo.lat;
    structure.lng = geo.lng;
  } else if (structure.lng != null || structure.lat != null) {
    structure.coordX = structure.coordX ?? structure.lng ?? 0;
    structure.coordY = structure.coordY ?? structure.lat ?? 0;
    structure.lat = structure.lat ?? structure.coordY;
    structure.lng = structure.lng ?? structure.coordX;
  } else {
    structure.coordX = structure.coordX ?? structure.lng ?? 0;
    structure.coordY = structure.coordY ?? structure.lat ?? 0;
    structure.lat = structure.coordY;
    structure.lng = structure.coordX;
  }
  return structure;
}

export function addStructure(structure: Structure): void {
  const store = getStore();
  const filled = fillStructureCoordinates(structure);
  store.structures.push(filled);
  addSystemLog({ level: 'info', module: 'Estruturas', message: `Nova estrutura criada: ${structure.name}` });
  saveStore(store);
  enqueueMutation('structures', 'create', filled.id, filled);
}

export function updateStructure(updated: Structure): void {
  const store = getStore();
  const filled = fillStructureCoordinates(updated);
  const idx = store.structures.findIndex((s) => s.id === updated.id);
  if (idx >= 0) store.structures[idx] = filled;
  saveStore(store);
  enqueueMutation('structures', 'update', filled.id, filled);
}

export function deleteStructure(id: string): void {
  const store = getStore();
  store.structures = store.structures.filter((s) => s.id !== id);
  saveStore(store);
  enqueueMutation('structures', 'delete', id);
}

export function addServiceOrder(order: ServiceOrder): void {
  const store = getStore();
  store.serviceOrders.push(order);

  const structure = store.structures.find((s) => s.id === order.structureId);
  const supervisor = store.users.find((u) => u.id === order.supervisorId);
  const technician = store.users.find((u) => u.id === order.technicianId);

  if (order.type === 'execucao') {
    if (!store.executionRecords) store.executionRecords = [];
    const execRec: ExecutionRecord = {
      id: `exec_${generateId()}`,
      orderId: order.id, estruturaId: order.structureId, estruturaNome: structure?.name || order.structureId,
      supervisorId: order.supervisorId, supervisorNome: supervisor?.name || order.supervisorId,
      tecnicoId: order.technicianId, tecnicoNome: technician?.name || order.technicianId,
      componente: order.component || '', anomalia: order.anomaly || '',
      descricao: order.description, detalhes: order.details,
      prazoRegras: order.deadlineRules, notasSupervisor: order.supervisorNotes,
      dataHoraAbertura: order.createdAt, status: 'pendente', historicoPausas: [], photos: [],
    };
    store.executionRecords.push(execRec);
    order.executionRecordId = execRec.id;
    syncExecutionRecord(execRec);
  }

  addSystemLog({ level: 'info', module: 'Ordens', message: `Nova ordem criada: ${order.id} (${order.type})` });
  saveStore(store);
  enqueueMutation('serviceOrders', 'create', order.id, order);
}

export function updateServiceOrder(updated: ServiceOrder): void {
  const store = getStore();
  const idx = store.serviceOrders.findIndex((o) => o.id === updated.id);
  if (idx >= 0) store.serviceOrders[idx] = updated;
  saveStore(store);
  enqueueMutation('serviceOrders', 'update', updated.id, updated);
}

export function deleteServiceOrder(id: string): void {
  const store = getStore();
  store.serviceOrders = store.serviceOrders.filter((o) => o.id !== id);
  saveStore(store);
  enqueueMutation('serviceOrders', 'delete', id);
}

// ─── Usuários (CRUD passa pela API autenticada — nunca pelo outbox genérico,
// porque criar/trocar senha exige hash feito no servidor) ────────────────────

export async function addUser(user: SystemUser & { password?: string }): Promise<SystemUser> {
  const { password, ...rest } = user;
  const res = await fetch(`${API_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...rest, password }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Falha ao criar usuário');
  const created = await res.json();

  const store = getStore();
  store.users.push(created);
  addSystemLog({ level: 'info', module: 'Usuários', message: `Novo usuário criado: ${created.name} (${created.role})` });
  saveStore(store);
  return created;
}

export async function updateUser(updated: SystemUser & { password?: string }): Promise<SystemUser> {
  const { password, ...rest } = updated;
  const res = await fetch(`${API_URL}/users/${updated.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...rest, ...(password ? { password } : {}) }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Falha ao atualizar usuário');
  const saved = await res.json();

  const store = getStore();
  const idx = store.users.findIndex((u) => u.id === saved.id);
  if (idx >= 0) store.users[idx] = saved;
  saveStore(store);
  return saved;
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/users/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 204) throw new Error('Falha ao excluir usuário');

  const store = getStore();
  store.users = store.users.filter((u) => u.id !== id);
  saveStore(store);
}

export function updateUserProfile(userId: string, updates: Partial<SystemUser> & { password?: string }): void {
  const store = getStore();
  const idx = store.users.findIndex((u) => u.id === userId);
  if (idx < 0) return;
  const { password, ...rest } = updates;
  store.users[idx] = { ...store.users[idx], ...rest };
  saveStore(store);

  fetch(`${API_URL}/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...rest, ...(password ? { password } : {}) }),
  }).catch((err) => console.error('[Perfil] Falha ao salvar no servidor:', err));
}

export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * ID de ordem de serviço curto e rastreável: OS-AAAAMMDD-XXXX. Ordena
 * naturalmente por data (útil em listas e nos nomes de arquivo do backup) e
 * ainda é fácil de citar em voz alta ou anotar no campo — ao contrário de
 * um UUID inteiro. O sufixo de 4 caracteres cobre ~1,6 milhão de
 * combinações por dia, mais que suficiente para o volume de ordens de uma
 * única linha de transmissão.
 */
export function generateOrderId(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OS-${datePart}-${suffix}`;
}

// ─── Banco de Inspeções helpers ──────────────────────────────────────────────

export function getInspectionRecords(): InspectionRecord[] {
  return getStore().inspectionRecords ?? [];
}
export function getInspectionRecordById(id: string): InspectionRecord | undefined {
  return getStore().inspectionRecords?.find((r) => r.id === id);
}
export function getInspectionRecordByOrderId(orderId: string): InspectionRecord | undefined {
  return getStore().inspectionRecords?.find((r) => r.orderId === orderId);
}
export function updateInspectionRecord(updated: InspectionRecord): void {
  const store = getStore();
  if (!store.inspectionRecords) store.inspectionRecords = [];
  const idx = store.inspectionRecords.findIndex((r) => r.id === updated.id);
  if (idx >= 0) store.inspectionRecords[idx] = updated;
  else store.inspectionRecords.push(updated);
  saveStore(store);
  syncInspectionRecord(updated);
}
export function deleteInspectionRecord(id: string): void {
  const store = getStore();
  if (!store.inspectionRecords) return;
  store.inspectionRecords = store.inspectionRecords.filter((r) => r.id !== id);
  saveStore(store);
  enqueueMutation('inspectionRecords', 'delete', id);
}

// ─── Banco de Execuções helpers ──────────────────────────────────────────────

export function getExecutionRecords(): ExecutionRecord[] {
  return getStore().executionRecords ?? [];
}
export function getExecutionRecordById(id: string): ExecutionRecord | undefined {
  return getStore().executionRecords?.find((r) => r.id === id);
}
export function getExecutionRecordByOrderId(orderId: string): ExecutionRecord | undefined {
  return getStore().executionRecords?.find((r) => r.orderId === orderId);
}
export function updateExecutionRecord(updated: ExecutionRecord): void {
  const store = getStore();
  if (!store.executionRecords) store.executionRecords = [];
  const idx = store.executionRecords.findIndex((r) => r.id === updated.id);
  if (idx >= 0) store.executionRecords[idx] = updated;
  else store.executionRecords.push(updated);
  saveStore(store);
  syncExecutionRecord(updated);
}
export function deleteExecutionRecord(id: string): void {
  const store = getStore();
  if (!store.executionRecords) return;
  store.executionRecords = store.executionRecords.filter((r) => r.id !== id);
  saveStore(store);
  enqueueMutation('executionRecords', 'delete', id);
}

// ─── Checklist Component helpers ─────────────────────────────────────────────

export function getChecklistComponents(): ComponentRule[] {
  return getStore().checklistComponents ?? [];
}
export function addChecklistComponent(component: ComponentRule): void {
  const store = getStore();
  if (!store.checklistComponents) store.checklistComponents = [];
  store.checklistComponents.push(component);
  saveStore(store);
  enqueueMutation('checklistComponents', 'create', component.id, component);
}
export function updateChecklistComponent(updated: ComponentRule): void {
  const store = getStore();
  if (!store.checklistComponents) store.checklistComponents = [];
  const idx = store.checklistComponents.findIndex((c) => c.id === updated.id);
  if (idx >= 0) store.checklistComponents[idx] = updated;
  saveStore(store);
  enqueueMutation('checklistComponents', 'update', updated.id, updated);
}
export function deleteChecklistComponent(id: string): void {
  const store = getStore();
  if (!store.checklistComponents) store.checklistComponents = [];
  store.checklistComponents = store.checklistComponents.filter((c) => c.id !== id);
  saveStore(store);
  enqueueMutation('checklistComponents', 'delete', id);
}

// ─── Severity helpers ────────────────────────────────────────────────────────

export function getSeverities(): SeverityOption[] {
  return getStore().severities ?? [];
}
export function addSeverity(sev: SeverityOption): void {
  const store = getStore();
  if (!store.severities) store.severities = [];
  store.severities.push(sev);
  addSystemLog({ level: 'info', module: 'Configurações', message: `Nova severidade adicionada: ${sev.label}` });
  saveStore(store);
  enqueueMutation('severities', 'create', sev.id, sev);
}
export function updateSeverity(updated: SeverityOption): void {
  const store = getStore();
  if (!store.severities) store.severities = [];
  const idx = store.severities.findIndex((s) => s.id === updated.id);
  if (idx >= 0) store.severities[idx] = updated;
  saveStore(store);
  enqueueMutation('severities', 'update', updated.id, updated);
}
export function deleteSeverity(id: string): void {
  const store = getStore();
  if (!store.severities) store.severities = [];
  store.severities = store.severities.filter((s) => s.id !== id);
  addSystemLog({ level: 'warning', module: 'Configurações', message: `Severidade removida: ${id}` });
  saveStore(store);
  enqueueMutation('severities', 'delete', id);
}

// ─── System Log helpers (locais a este dispositivo — não sincronizados) ─────

export function addSystemLog(entry: Omit<SystemLog, 'id' | 'timestamp'>): void {
  try {
    const store = getStore();
    if (!store.systemLogs) store.systemLogs = [];
    const lastReset = store.logsLastReset ? new Date(store.logsLastReset).getTime() : 0;
    if (Date.now() - lastReset > LOG_RESET_INTERVAL_MS) {
      store.systemLogs = [];
      store.logsLastReset = new Date().toISOString();
      store.systemLogs.push({ id: generateId(), timestamp: new Date().toISOString(), level: 'info', module: 'Sistema', message: 'Logs resetados automaticamente (ciclo 24h)' });
    }
    store.systemLogs.push({ id: generateId(), timestamp: new Date().toISOString(), ...entry });
    if (store.systemLogs.length > 500) store.systemLogs = store.systemLogs.slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { timestamp: Date.now(), source: 'system-log' } }));
  } catch {
    // silent fail
  }
}

export function getSystemLogs(): SystemLog[] {
  return (getStore().systemLogs ?? []).slice().reverse();
}

export function resetSystemLogs(): void {
  const store = getStore();
  store.systemLogs = [];
  store.logsLastReset = new Date().toISOString();
  store.systemLogs.push({ id: generateId(), timestamp: new Date().toISOString(), level: 'info', module: 'Sistema', message: 'Logs resetados manualmente pelo administrador' });
  saveStore(store);
}

export function getLogsNextReset(): Date | null {
  const store = getStore();
  if (!store.logsLastReset) return null;
  return new Date(new Date(store.logsLastReset).getTime() + LOG_RESET_INTERVAL_MS);
}
