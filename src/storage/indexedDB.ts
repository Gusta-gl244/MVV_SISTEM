// IndexedDB Wrapper — cache local + fila de sincronização offline
const DB_NAME = 'inspec360-data'
const DB_VERSION = 2

export interface OutboxMutation {
  clientOpId: string
  entity: string
  op: 'create' | 'update' | 'delete'
  id: string
  payload?: any
  clientUpdatedAt: string
  deviceId: string
  createdAt: number
}

interface PendingRequest {
  id?: number
  url: string
  method: string
  body?: string
  headers?: Record<string, string>
  timestamp: number
}

class OfflineStorage {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  async init() {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains('pending-requests')) {
          const store = db.createObjectStore('pending-requests', { keyPath: 'id', autoIncrement: true })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'url' })
        }
        if (!db.objectStoreNames.contains('offline-state')) {
          db.createObjectStore('offline-state', { keyPath: 'key' })
        }
        // Fila de mutações pendentes (criações/edições/exclusões feitas
        // offline) — drenada pelo motor de sincronização assim que a conexão
        // volta. Nunca é limpa por um pull; só some quando o servidor
        // confirma o recebimento.
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'clientOpId' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
        // Metadados do motor de sync (ex.: lastPullAt).
        if (!db.objectStoreNames.contains('sync-meta')) {
          db.createObjectStore('sync-meta', { keyPath: 'key' })
        }
      }
    })

    return this.initPromise
  }

  // ─── Outbox de mutações ────────────────────────────────────────────────

  async addToOutbox(mutation: OutboxMutation): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['outbox'], 'readwrite')
      const req = tx.objectStore('outbox').put(mutation)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getOutbox(): Promise<OutboxMutation[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['outbox'], 'readonly')
      const req = tx.objectStore('outbox').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async removeFromOutbox(clientOpId: string): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['outbox'], 'readwrite')
      const req = tx.objectStore('outbox').delete(clientOpId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  // ─── Metadados de sync ──────────────────────────────────────────────────

  async getSyncMeta(key: string): Promise<any> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['sync-meta'], 'readonly')
      const req = tx.objectStore('sync-meta').get(key)
      req.onsuccess = () => resolve(req.result ? req.result.value : null)
      req.onerror = () => reject(req.error)
    })
  }

  async setSyncMeta(key: string, value: any): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['sync-meta'], 'readwrite')
      const req = tx.objectStore('sync-meta').put({ key, value })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  // ─── Requisições pendentes (legado, mantido por compatibilidade) ───────

  async addPendingRequest(request: PendingRequest): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pending-requests'], 'readwrite')
      const store = transaction.objectStore('pending-requests')
      const req = store.add({ ...request, timestamp: Date.now() })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getPendingRequests(): Promise<PendingRequest[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pending-requests'], 'readonly')
      const store = transaction.objectStore('pending-requests')
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async removePendingRequest(id: number): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['pending-requests'], 'readwrite')
      const store = transaction.objectStore('pending-requests')
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  // ─── Cache de leitura ───────────────────────────────────────────────────

  async cacheData(url: string, data: unknown): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')
      const req = store.put({ url, data, timestamp: Date.now() })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getCachedData(url: string): Promise<unknown | null> {
    await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readonly')
      const store = transaction.objectStore('cache')
      const req = store.get(url)
      req.onsuccess = () => resolve(req.result ? req.result.data : null)
      req.onerror = () => reject(req.error)
    })
  }

  async setOfflineState(online: boolean): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offline-state'], 'readwrite')
      const store = transaction.objectStore('offline-state')
      const req = store.put({ key: 'isOnline', value: online, timestamp: Date.now() })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async isOnline(): Promise<boolean> {
    await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offline-state'], 'readonly')
      const store = transaction.objectStore('offline-state')
      const req = store.get('isOnline')
      req.onsuccess = () => resolve(req.result ? req.result.value : navigator.onLine)
      req.onerror = () => reject(req.error)
    })
  }

  async clearOldCache(): Promise<void> {
    await this.init()
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite')
      const store = transaction.objectStore('cache')
      const req = store.openCursor()
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          const record = cursor.value
          if (record.timestamp && record.timestamp < twentyFourHoursAgo) {
            cursor.delete()
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
      req.onerror = () => reject(req.error)
    })
  }
}

export const offlineStorage = new OfflineStorage()
