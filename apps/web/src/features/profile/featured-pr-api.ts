import type { FeaturedPrSelection, FeaturedPrShowcase } from '@light-weight/domain';
import { apiEndpoint } from '../../lib/api-base.js';
import { mapApiError, requestJson, type OperationResult } from '../../lib/api-errors.js';

export type FeaturedPrResponse = FeaturedPrShowcase;

async function operation(request: () => Promise<FeaturedPrResponse>): Promise<OperationResult<FeaturedPrResponse>> {
  try { return { ok: true, data: await request() }; }
  catch (error) { return { ok: false, error: mapApiError(error) }; }
}

export const featuredPrApi = {
  get(signal?: AbortSignal) {
    return operation(() => requestJson<FeaturedPrResponse>(apiEndpoint('/api/profile/featured-prs'), { signal }));
  },
  put(selections: FeaturedPrSelection[]) {
    return operation(() => requestJson<FeaturedPrResponse>(apiEndpoint('/api/profile/featured-prs'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selections })
    }));
  }
};
