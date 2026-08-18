/**
 * INSPEC360 API Client — cliente REST usado pelas telas administrativas
 * (Bases de Dados, import de CSV, backups). O fluxo do dia a dia (técnico/
 * supervisor) passa pelo motor de sincronização em src/sync/engine.ts, não
 * por este cliente.
 */
import { TOKEN_KEY } from '@/app/data/constants';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAPI(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const authAPI = {
  async login(email, password) {
    return fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
};

export const usersAPI = {
  async getAll() { return fetchAPI('/users'); },
  async getById(id) { return fetchAPI(`/users/${id}`); },
  async create(userData) { return fetchAPI('/users', { method: 'POST', body: JSON.stringify(userData) }); },
  async update(id, userData) { return fetchAPI(`/users/${id}`, { method: 'PUT', body: JSON.stringify(userData) }); },
  async delete(id) { return fetchAPI(`/users/${id}`, { method: 'DELETE' }); },
};

export const structuresAPI = {
  async getAll() { return fetchAPI('/structures'); },
  async getById(id) { return fetchAPI(`/structures/${id}`); },
  async create(structureData) { return fetchAPI('/structures', { method: 'POST', body: JSON.stringify(structureData) }); },
  async importMany(structures) { return fetchAPI('/structures/import', { method: 'POST', body: JSON.stringify(structures) }); },
  async update(id, structureData) { return fetchAPI(`/structures/${id}`, { method: 'PUT', body: JSON.stringify(structureData) }); },
  async delete(id) { return fetchAPI(`/structures/${id}`, { method: 'DELETE' }); },
};

export const componentsAPI = {
  async getAll() { return fetchAPI('/components'); },
  async getById(id) { return fetchAPI(`/components/${id}`); },
  async create(componentData) { return fetchAPI('/components', { method: 'POST', body: JSON.stringify(componentData) }); },
  async update(id, componentData) { return fetchAPI(`/components/${id}`, { method: 'PUT', body: JSON.stringify(componentData) }); },
  async delete(id) { return fetchAPI(`/components/${id}`, { method: 'DELETE' }); },
};

export const serviceOrdersAPI = {
  async getAll() { return fetchAPI('/service-orders'); },
  async getById(id) { return fetchAPI(`/service-orders/${id}`); },
  async create(orderData) { return fetchAPI('/service-orders', { method: 'POST', body: JSON.stringify(orderData) }); },
  async update(id, orderData) { return fetchAPI(`/service-orders/${id}`, { method: 'PUT', body: JSON.stringify(orderData) }); },
  async delete(id) { return fetchAPI(`/service-orders/${id}`, { method: 'DELETE' }); },
};

export const inspectionsAPI = {
  async getAll() { return fetchAPI('/inspections'); },
  async getById(id) { return fetchAPI(`/inspections/${id}`); },
  async create(inspectionData) { return fetchAPI('/inspections', { method: 'POST', body: JSON.stringify(inspectionData) }); },
  async update(id, inspectionData) { return fetchAPI(`/inspections/${id}`, { method: 'PUT', body: JSON.stringify(inspectionData) }); },
};

export const executionsAPI = {
  async getAll() { return fetchAPI('/executions'); },
  async getById(id) { return fetchAPI(`/executions/${id}`); },
  async create(executionData) { return fetchAPI('/executions', { method: 'POST', body: JSON.stringify(executionData) }); },
  async update(id, executionData) { return fetchAPI(`/executions/${id}`, { method: 'PUT', body: JSON.stringify(executionData) }); },
};

export const backupsAPI = {
  async run() { return fetchAPI('/backups/run', { method: 'POST' }); },
  async list() { return fetchAPI('/backups'); },
  // O download exige o cabeçalho Authorization (JWT), que um <a href> puro
  // não consegue enviar — busca como blob e devolve pronto para salvar.
  async download(id) {
    const res = await fetch(`${API_URL}/backups/${id}/download`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Falha ao baixar backup');
    return res.blob();
  },
  async remove(id) { return fetchAPI(`/backups/${id}`, { method: 'DELETE' }); },
  async getSchedule() { return fetchAPI('/backups/schedule/config'); },
  async setSchedule(config) { return fetchAPI('/backups/schedule/config', { method: 'PUT', body: JSON.stringify(config) }); },
};

export const diagnosticsAPI = {
  async get() { return fetchAPI('/diagnostics'); },
};

export const referenceAPI = {
  async splices() { return fetchAPI('/reference/splices'); },
  async lineInfo() { return fetchAPI('/reference/line-info'); },
  async severities() { return fetchAPI('/reference/severities'); },
};

export const syncAPI = {
  async checkConnection() {
    try {
      const response = await fetch(`${API_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  },
};

export default {
  authAPI,
  usersAPI,
  structuresAPI,
  componentsAPI,
  serviceOrdersAPI,
  inspectionsAPI,
  executionsAPI,
  backupsAPI,
  referenceAPI,
  diagnosticsAPI,
  syncAPI,
};
