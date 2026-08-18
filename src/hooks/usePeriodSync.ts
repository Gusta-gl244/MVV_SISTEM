import { useEffect } from 'react';
import { initSyncEngine } from '@/sync/engine';

/**
 * Liga o motor de sincronização (fila de mutações + pull incremental) —
 * ver src/sync/engine.ts para o mecanismo completo. Mantido com este nome
 * por compatibilidade com o App.tsx existente.
 */
export function usePeriodSync(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    return initSyncEngine();
  }, [enabled]);
}

/**
 * Hook para componentes que precisam re-renderizar quando os dados mudam
 * (nova sincronização, escrita local, etc).
 */
export function useOnDataSync(callback: (event: CustomEvent) => void) {
  useEffect(() => {
    const handler = (event: Event) => callback(event as CustomEvent);
    window.addEventListener('dataSync', handler);
    window.addEventListener('dataRefresh', handler);
    return () => {
      window.removeEventListener('dataSync', handler);
      window.removeEventListener('dataRefresh', handler);
    };
  }, [callback]);
}
