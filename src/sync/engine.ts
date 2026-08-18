import { offlineStorage, type OutboxMutation } from '@/storage/indexedDB';
import { STORAGE_KEY, getDeviceId, getToken } from '@/app/data/constants';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Mapeia o nome da entidade no servidor para a chave da coleção no AppData
// local — os dois lados usam nomes ligeiramente diferentes por causa da
// migração do schema antigo ("componentRules" no banco, "checklistComponents"
// no store do frontend).
const ENTITY_TO_COLLECTION: Record<string, string> = {
  users: 'users',
  structures: 'structures',
  componentRules: 'checklistComponents',
  severities: 'severities',
  serviceOrders: 'serviceOrders',
  inspectionRecords: 'inspectionRecords',
  executionRecords: 'executionRecords',
};
const COLLECTION_TO_ENTITY: Record<string, string> = Object.fromEntries(
  Object.entries(ENTITY_TO_COLLECTION).map(([entity, collection]) => [collection, entity])
);

let inFlightSync: Promise<void> | null = null;
let listenersAttached = false;

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function readLocalData(): any {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalData(data: any) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { timestamp: Date.now(), source: 'sync' } }));
}

/**
 * Enfileira uma mutação (criação/edição/exclusão) feita localmente. Grava no
 * outbox do IndexedDB — sobrevive a reload de página e a ficar offline por
 * dias — e dispara uma tentativa de envio em segundo plano (best-effort,
 * nunca bloqueia quem chamou).
 */
export async function enqueueMutation(
  collection: string,
  op: 'create' | 'update' | 'delete',
  id: string,
  payload?: any
): Promise<void> {
  const entity = COLLECTION_TO_ENTITY[collection];
  if (!entity) return; // coleção não sincronizada com o servidor (ex.: systemLogs)

  const mutation: OutboxMutation = {
    clientOpId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    entity,
    op,
    id,
    payload,
    clientUpdatedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    createdAt: Date.now(),
  };

  await offlineStorage.addToOutbox(mutation);
  drainOutbox().catch(() => {});
}

/**
 * Envia todas as mutações pendentes ao servidor. Sempre roda antes de
 * qualquer pull — é isso que garante que um registro criado/editado offline
 * nunca seja apagado por uma sincronização recebida do servidor: o pull só
 * enxerga o que o servidor já confirmou.
 */
export async function drainOutbox(): Promise<void> {
  if (!navigator.onLine) return;

  const pending = await offlineStorage.getOutbox();
  if (pending.length === 0) return;

  try {
    const res = await fetch(`${API_URL}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ mutations: pending }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return;

    const { results } = await res.json();
    const local = readLocalData();

    for (const result of results) {
      const mutation = pending.find((m) => m.clientOpId === result.clientOpId);
      if (!mutation) continue;
      if (result.status === 'error') continue; // mantém no outbox, tenta de novo depois

      await offlineStorage.removeFromOutbox(result.clientOpId);

      const collection = ENTITY_TO_COLLECTION[mutation.entity];
      if (!local || !collection || !Array.isArray(local[collection])) continue;

      if (mutation.op === 'delete') {
        // Exclusão confirmada pelo servidor — o registro já tinha sido
        // removido localmente na hora da ação (deleteServiceOrder etc.), só
        // garante que continua fora. Nunca reaplica `result.record` aqui:
        // ele é só um stub `{ id, deletedAt }` (softDelete não devolve o
        // registro inteiro) — tratá-lo como "registro não encontrado,
        // deve ser novo" (o ramo abaixo, usado por create/update) recolocava
        // essa exclusão de volta na lista local com todos os outros campos
        // vazios, fazendo a ordem excluída "reaparecer" fantasma.
        local[collection] = local[collection].filter((r: any) => r.id !== mutation.id);
        continue;
      }

      // Aplica a versão autoritativa devolvida pelo servidor (em caso de
      // conflito, é a versão do servidor que prevalece — a nossa foi mais
      // antiga que uma edição já confirmada por outra pessoa).
      if (result.record) {
        const idx = local[collection].findIndex((r: any) => r.id === result.record.id);
        if (idx >= 0) local[collection][idx] = result.record;
        else local[collection].push(result.record);
      }
    }

    if (local) writeLocalData(local);
    window.dispatchEvent(new CustomEvent('backend-sync-success', { detail: { timestamp: Date.now(), count: pending.length } }));
  } catch (error) {
    // sem rede ou timeout — mutações continuam no outbox para a próxima tentativa
    window.dispatchEvent(new CustomEvent('backend-sync-failed', { detail: { error } }));
  }
}

/**
 * Busca tudo que mudou no servidor desde o último pull e mescla na cópia
 * local, registro por registro. Nunca substitui uma coleção inteira — só
 * atualiza/insere os ids que vieram na resposta e remove os que o servidor
 * marcou como excluídos.
 */
export async function pull(): Promise<void> {
  if (!navigator.onLine) return;

  const since = (await offlineStorage.getSyncMeta('lastPullAt')) || '';
  try {
    const res = await fetch(`${API_URL}/sync/pull?since=${encodeURIComponent(since)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return;

    const { serverTime, data, deleted } = await res.json();
    const local = readLocalData() || {};

    for (const [entity, collection] of Object.entries(ENTITY_TO_COLLECTION)) {
      const incoming = data[entity] as any[] | undefined;
      const deletedIds = new Set(deleted[entity] as string[] | undefined);
      if (!Array.isArray(local[collection])) local[collection] = [];

      if (incoming?.length) {
        const byId = new Map(local[collection].map((r: any) => [r.id, r]));
        for (const record of incoming) byId.set(record.id, record);
        local[collection] = [...byId.values()];
      }
      if (deletedIds.size) {
        local[collection] = local[collection].filter((r: any) => !deletedIds.has(r.id));
      }
    }

    writeLocalData(local);
    await offlineStorage.setSyncMeta('lastPullAt', serverTime);
  } catch {
    // sem rede ou timeout — mantém os dados locais como estão
  }
}

/**
 * Roda um ciclo (drena outbox + pull). Se já houver um ciclo em andamento,
 * quem chamar de novo espera o MESMO ciclo terminar em vez de disparar um
 * segundo em paralelo ou (pior) retornar na hora como se já tivesse
 * terminado — isso importa porque App.tsx e usePeriodSync() disparam o
 * primeiro ciclo quase ao mesmo tempo no boot, e o gate de "carregando" do
 * app depende de esperar a sincronização de verdade terminar.
 */
export async function runSyncCycle(): Promise<void> {
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    try {
      await drainOutbox();
      await pull();
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

export function initSyncEngine(intervalMs = 20000) {
  runSyncCycle();

  const interval = setInterval(() => {
    if (navigator.onLine) runSyncCycle();
  }, intervalMs);

  const handleOnline = () => runSyncCycle();
  window.addEventListener('online', handleOnline);

  const handleVisibility = () => {
    if (!document.hidden && navigator.onLine) runSyncCycle();
  };
  document.addEventListener('visibilitychange', handleVisibility);

  if (!listenersAttached) {
    listenersAttached = true;
  }

  return () => {
    clearInterval(interval);
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
