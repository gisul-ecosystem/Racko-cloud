'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchTemplates, fetchTemplateDetails, type ProxmoxTemplate, type TemplateDetails } from '../lib/vmApi';
import { ApiError } from '../lib/apiClient';

interface UseTemplatesResult {
  templates: ProxmoxTemplate[];
  loading: boolean;
  error: string | null;
}

export function useTemplates(isAuthenticated: boolean): UseTemplatesResult {
  const [templates, setTemplates] = useState<ProxmoxTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTemplates();
      setTemplates(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500 ? 'Service temporarily unavailable.' : err.message
          : 'Failed to load templates.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  return { templates, loading, error };
}

interface UseTemplateDetailsResult {
  details: TemplateDetails | null;
  loading: boolean;
  error: string | null;
}

export function useTemplateDetails(templateId: number | null): UseTemplateDetailsResult {
  const [details, setDetails] = useState<TemplateDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) { setDetails(null); return; }
    setLoading(true);
    setError(null);
    fetchTemplateDetails(templateId)
      .then(setDetails)
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load template details.'
        );
      })
      .finally(() => setLoading(false));
  }, [templateId]);

  return { details, loading, error };
}
