'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNostr } from './provider';
import type { Filter, Event, SubCloser } from 'nostr-tools';

export interface UseNostrSubscriptionOptions {
  /** Whether to start the subscription immediately */
  enabled?: boolean;
  /** Clear events when filters change */
  clearOnFilterChange?: boolean;
  /** Callback when subscription ends (EOSE received) */
  onEose?: () => void;
  /** Deduplicate events by ID */
  deduplicate?: boolean;
}

export interface UseNostrSubscriptionResult<T = Event> {
  /** Events received from the subscription */
  events: T[];
  /** Whether the subscription is loading (before EOSE) */
  isLoading: boolean;
  /** Whether there was an error */
  error: Error | null;
  /** Whether the relay is connected */
  isConnected: boolean;
  /** Manually close the subscription */
  close: () => void;
  /** Clear all events */
  clearEvents: () => void;
  /** Restart the subscription */
  restart: () => void;
}

/**
 * Hook for subscribing to Nostr events with automatic cleanup
 */
export function useNostrSubscription<T = Event>(
  filters: Filter[],
  options: UseNostrSubscriptionOptions = {}
): UseNostrSubscriptionResult<T> {
  const {
    enabled = true,
    clearOnFilterChange = true,
    onEose,
    deduplicate = true
  } = options;

  const { subscribe, isConnected } = useNostr();
  const [events, setEvents] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const subRef = useRef<SubCloser | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const filtersRef = useRef<Filter[]>(filters);

  // Clear events function
  const clearEvents = useCallback(() => {
    setEvents([]);
    seenIds.current.clear();
  }, []);

  // Close subscription function
  const close = useCallback(() => {
    if (subRef.current) {
      subRef.current.close();
      subRef.current = null;
    }
  }, []);

  // Start/restart subscription
  const startSubscription = useCallback(() => {
    // Close existing subscription
    close();
    
    if (!enabled || filters.length === 0) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sub = subscribe(
        filters,
        (event) => {
          // Deduplicate if enabled
          if (deduplicate && seenIds.current.has(event.id)) {
            return;
          }
          seenIds.current.add(event.id);
          
          setEvents(prev => [...prev, event as T]);
        },
        () => {
          setIsLoading(false);
          onEose?.();
        }
      );

      subRef.current = sub;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Subscription failed'));
      setIsLoading(false);
    }
  }, [close, enabled, filters, subscribe, deduplicate, onEose]);

  // Restart function (for manual refresh)
  const restart = useCallback(() => {
    clearEvents();
    startSubscription();
  }, [clearEvents, startSubscription]);

  // Handle filter changes
  useEffect(() => {
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(filtersRef.current);
    filtersRef.current = filters;

    if (filtersChanged && clearOnFilterChange) {
      clearEvents();
    }

    if (enabled) {
      startSubscription();
    }

    return () => {
      close();
    };
  }, [enabled, filters, clearOnFilterChange, clearEvents, startSubscription, close]);

  return {
    events,
    isLoading,
    error,
    isConnected,
    close,
    clearEvents,
    restart
  };
}

/**
 * Hook for one-time queries (not real-time subscriptions)
 */
export function useNostrQuery<T = Event>(
  filters: Filter[],
  options: { enabled?: boolean } = {}
): {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const { enabled = true } = options;
  const { querySync, isConnected } = useNostr();
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled || filters.length === 0 || !isConnected) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const events = await querySync(filters);
      setData(events as T[]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Query failed'));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, filters, isConnected, querySync]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData
  };
}
