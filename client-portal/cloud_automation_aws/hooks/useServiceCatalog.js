'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCategories, getServices } from '../api/client';

export function useServiceCatalog(enabled = true) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [categoryData, serviceData] = await Promise.all([getCategories(), getServices()]);
      setCategories(categoryData);
      setServices(Array.isArray(serviceData) ? serviceData : []);
    } catch (err) {
      setError(err?.message || 'Failed to load service catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const servicesByCategory = useMemo(() => {
    const grouped = new Map();
    for (const service of services) {
      const categoryName =
        typeof service.categoryId === 'object' && service.categoryId?.name
          ? service.categoryId.name
          : 'General';
      const list = grouped.get(categoryName) ?? [];
      list.push(service);
      grouped.set(categoryName, list);
    }
    return grouped;
  }, [services]);

  return { categories, services, servicesByCategory, loading, error, refetch: load };
}
