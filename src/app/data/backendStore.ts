/**
 * Wrappers finos sobre a API REST, usados pelas telas administrativas
 * (Bases de Dados) para ler os dados diretamente do servidor. A
 * sincronização de verdade (offline-first, com fila de mutações) vive em
 * src/sync/engine.ts — isto aqui é só leitura sob demanda.
 */
import type {
  SystemUser,
  Structure,
  ServiceOrder,
  InspectionRecord,
  ExecutionRecord,
  ComponentRule,
} from './types';
import * as api from '@/api/client';

export const userStore = {
  async getAll(): Promise<SystemUser[]> { return api.usersAPI.getAll(); },
};

export const structureStore = {
  async getAll(): Promise<Structure[]> { return api.structuresAPI.getAll(); },
};

export const componentStore = {
  async getAll(): Promise<ComponentRule[]> { return api.componentsAPI.getAll(); },
};

export const serviceOrderStore = {
  async getAll(): Promise<ServiceOrder[]> { return api.serviceOrdersAPI.getAll(); },
};

export const inspectionStore = {
  async getAll(): Promise<InspectionRecord[]> { return api.inspectionsAPI.getAll(); },
};

export const executionStore = {
  async getAll(): Promise<ExecutionRecord[]> { return api.executionsAPI.getAll(); },
};

export const backendStore = {
  userStore,
  structureStore,
  componentStore,
  serviceOrderStore,
  inspectionStore,
  executionStore,
};

export default backendStore;
