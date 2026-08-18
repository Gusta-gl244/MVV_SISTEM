import { useEffect, useState } from 'react';
import { runSyncCycle } from '@/sync/engine';

/**
 * Hook para disparar re-render quando dados são sincronizados.
 */
export function useDataSync() {
  const [syncCounter, setSyncCounter] = useState(0);

  useEffect(() => {
    const handleDataRefresh = () => setSyncCounter((prev) => prev + 1);
    window.addEventListener('dataRefresh', handleDataRefresh);
    return () => window.removeEventListener('dataRefresh', handleDataRefresh);
  }, []);

  return { syncCounter };
}

/**
 * Força um ciclo de sincronização imediato (drena mutações pendentes e
 * busca o que há de novo no servidor). Usado em pull-to-refresh manual.
 */
export async function forceSync(): Promise<boolean> {
  await runSyncCycle();
  return true;
}
