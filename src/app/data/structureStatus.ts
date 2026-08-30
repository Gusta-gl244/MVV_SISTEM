import type { ServiceOrder, Structure } from './types';

// Status "ao vivo" de uma estrutura no mapa/dashboard, derivado das ordens de
// serviço associadas — não é mais um valor estático gravado na estrutura.
export type StructureDisplayStatus =
  | 'pendente'      // cinza — estrutura nova, sem ordem associada
  | 'atribuida'     // azul — ordem de serviço atribuída, ainda não iniciada
  | 'em-andamento'  // amarelo — inspeção em andamento
  | 'concluida'     // verde — inspeção concluída dentro dos últimos 60 dias
  | 'anomalia'      // vermelho — última inspeção concluída detectou anomalia
  | 'atrasada';     // vermelho escuro — ordem com prazo vencido / +60 dias sem inspeção concluída

export const STRUCTURE_STATUS_COLORS: Record<StructureDisplayStatus, string> = {
  pendente: '#6b7280',
  atribuida: '#2563eb',
  'em-andamento': '#eab308',
  concluida: '#16a34a',
  anomalia: '#dc2626',
  atrasada: '#7f1d1d',
};

export const STRUCTURE_STATUS_LABELS: Record<StructureDisplayStatus, string> = {
  pendente: 'Pendente',
  atribuida: 'Ordem Atribuída',
  'em-andamento': 'Em Andamento',
  concluida: 'Concluída',
  anomalia: 'Anomalia',
  atrasada: 'Atrasada',
};

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export interface StructureStatusFlags {
  isOverdue: boolean;
  inProgress: boolean;
  assigned: boolean;
  lastCompleted: ServiceOrder | undefined;
  lastCompletionRecent: boolean;
  lastCompletedHasAnomaly: boolean;
}

/**
 * Calcula os sinais brutos (em andamento? atrasada? concluída há pouco?
 * atribuída mas não iniciada?) a partir das ordens de uma estrutura — sem
 * decidir prioridade entre eles. computeStructureStatus usa isso pra decidir
 * uma única cor/rótulo pro mapa; outras telas (ex.: dashboard) usam os sinais
 * direto, porque "atrasada" não é excludente de "em andamento"/"pendente" —
 * uma inspeção pode estar em andamento E atrasada ao mesmo tempo.
 */
export function computeStructureStatusFlags(
  structure: Structure,
  orders: ServiceOrder[],
  now: number = Date.now()
): StructureStatusFlags {
  const structureOrders = orders.filter((o) => o.structureId === structure.id);

  const completedOrders = structureOrders
    .filter((o) => o.status === 'concluido' && o.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
  const lastCompleted = completedOrders[0];
  const daysSinceLastCompletion = lastCompleted
    ? now - new Date(lastCompleted.completedAt!).getTime()
    : Infinity;
  const lastCompletionRecent = daysSinceLastCompletion <= SIXTY_DAYS_MS;

  const lastCompletedHasAnomaly =
    !!lastCompleted?.inspectionData?.components.some((c) => c.status === 'anomalia');

  const isOverdue = structureOrders.some(
    (o) =>
      o.status !== 'concluido' &&
      o.status !== 'cancelado' &&
      o.deadline &&
      new Date(o.deadline).getTime() < now
  );
  const inProgress = structureOrders.some((o) => o.status === 'em-andamento' || o.status === 'pausado');
  const assigned = structureOrders.some((o) => o.status === 'pendente');

  return { isOverdue, inProgress, assigned, lastCompleted, lastCompletionRecent, lastCompletedHasAnomaly };
}

/**
 * Deriva o status de exibição (uma cor/rótulo só) de uma estrutura para o
 * mapa — aqui sim há prioridade: atrasada aparece antes de em-andamento
 * porque no mapa é o alerta mais urgente que precisa saltar aos olhos. Após
 * 60 dias sem uma inspeção concluída mais recente, a estrutura volta
 * automaticamente para "Pendente" (cinza).
 */
export function computeStructureStatus(
  structure: Structure,
  orders: ServiceOrder[],
  now: number = Date.now()
): StructureDisplayStatus {
  const { isOverdue, inProgress, assigned, lastCompleted, lastCompletionRecent, lastCompletedHasAnomaly } =
    computeStructureStatusFlags(structure, orders, now);

  if (lastCompletedHasAnomaly && lastCompletionRecent) return 'anomalia';
  if (isOverdue) return 'atrasada';
  if (inProgress) return 'em-andamento';
  if (assigned) return 'atribuida';
  if (lastCompleted && lastCompletionRecent) return 'concluida';
  return 'pendente';
}
