// apps/dsa-web/src/api/recommendation.ts
import apiClient from './index';
import type { RecommendationResult, Session } from '../types/recommendation';

export const recommendationApi = {
  async fetch(session: Session): Promise<RecommendationResult> {
    const response = await apiClient.post<RecommendationResult>(
      '/api/v1/market/recommendations',
      { session },
      { timeout: 60000 },
    );
    return response.data;
  },
};
