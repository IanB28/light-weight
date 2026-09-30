import { useCallback, useEffect, useState } from 'react';
import type { FeaturedPrSelection } from '@light-weight/domain';
import type { OperationResult } from '../../lib/api-errors.js';
import { getStoredFeaturedPrSelections, saveStoredFeaturedPrSelections } from '../../lib/storage.js';
import { featuredPrApi } from './featured-pr-api.js';

interface UseFeaturedPrSelectionsOptions {
  enabled: boolean;
  syncBeforeSave: () => Promise<OperationResult<{ syncedCount: number }>>;
}

export function useFeaturedPrSelections({ enabled, syncBeforeSave }: UseFeaturedPrSelectionsOptions) {
  const [selections, setSelections] = useState<FeaturedPrSelection[]>(getStoredFeaturedPrSelections);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelections(getStoredFeaturedPrSelections());
    if (!enabled) { setIsLoading(false); return; }
    const controller = new AbortController();
    setIsLoading(true);
    void featuredPrApi.get(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setSelections(saveStoredFeaturedPrSelections(result.data.selections));
      setIsLoading(false);
    });
    return () => controller.abort();
  }, [enabled]);

  const save = useCallback(async (next: FeaturedPrSelection[]): Promise<OperationResult<{ selections: FeaturedPrSelection[] }>> => {
    if (!enabled) return { ok: false, error: { code: 'auth_required', retryable: false } };
    if (isSaving) return { ok: false, error: { code: 'conflict', retryable: false } };
    setIsSaving(true);
    try {
      const syncResult = await syncBeforeSave();
      if (!syncResult.ok) return syncResult;
      const result = await featuredPrApi.put(next);
      if (!result.ok) return result;
      const canonical = saveStoredFeaturedPrSelections(result.data.selections);
      setSelections(canonical);
      return { ok: true, data: { selections: canonical } };
    } finally {
      setIsSaving(false);
    }
  }, [enabled, isSaving, syncBeforeSave]);

  return { selections, isLoading, isSaving, save };
}
