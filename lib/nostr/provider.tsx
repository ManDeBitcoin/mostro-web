'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { SimplePool, type SubCloser, type Filter, type Event } from 'nostr-tools';

export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RelayInfo {
  url: string;
  status: RelayStatus;
  lastConnected?: number;
  error?: string;
}

interface NostrContextValue {
  pool: SimplePool | null;
  relays: string[];
  relayStatuses: Map<string, RelayInfo>;
  isConnected: boolean;
  subscribe: (
    filters: Filter[],
    onEvent: (event: Event) => void,
    onEose?: () => void
  ) => SubCloser | null;
  publish: (event: Event) => Promise<void>;
  querySync: (filters: Filter[]) => Promise<Event[]>;
}

const NostrContext = createContext<NostrContextValue | null>(null);

// Get relays from environment variable or use defaults
function getRelays(): string[] {
  const envRelay = process.env.NEXT_PUBLIC_RELAY_URL;
  if (envRelay) {
    // Support multiple relays separated by comma
    return envRelay.split(',').map(r => r.trim()).filter(Boolean);
  }
  return ['wss://relay.mostro.network'];
}

export function NostrProvider({ children }: { children: React.ReactNode }) {
  const [pool, setPool] = useState<SimplePool | null>(null);
  const [relayStatuses, setRelayStatuses] = useState<Map<string, RelayInfo>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const relays = useRef<string[]>(getRelays());
  const reconnectTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const connectionCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize relay statuses
  useEffect(() => {
    const initialStatuses = new Map<string, RelayInfo>();
    relays.current.forEach(url => {
      initialStatuses.set(url, { url, status: 'disconnected' });
    });
    setRelayStatuses(initialStatuses);
  }, []);

  // Update relay status helper
  const updateRelayStatus = useCallback((url: string, status: RelayStatus, error?: string) => {
    setRelayStatuses(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(url) || { url, status: 'disconnected' };
      newMap.set(url, {
        ...existing,
        status,
        error,
        lastConnected: status === 'connected' ? Date.now() : existing.lastConnected
      });
      return newMap;
    });
  }, []);

  // Check if any relay is connected
  useEffect(() => {
    const hasConnected = Array.from(relayStatuses.values()).some(
      info => info.status === 'connected'
    );
    setIsConnected(hasConnected);
  }, [relayStatuses]);

  // Initialize SimplePool
  useEffect(() => {
    console.log('[v0] Initializing NostrProvider with relays:', relays.current);
    
    const simplePool = new SimplePool();
    setPool(simplePool);

    // Set all relays to connecting status
    relays.current.forEach(url => {
      updateRelayStatus(url, 'connecting');
    });

    // Test connection to each relay
    const testConnections = async () => {
      for (const url of relays.current) {
        try {
          // Create a test subscription to verify connection
          const sub = simplePool.subscribeMany(
            [url],
            [{ kinds: [1], limit: 1 }],
            {
              onevent: () => {
                updateRelayStatus(url, 'connected');
              },
              oneose: () => {
                updateRelayStatus(url, 'connected');
                sub.close();
              }
            }
          );

          // Timeout for connection test
          setTimeout(() => {
            const currentStatus = relayStatuses.get(url);
            if (currentStatus?.status === 'connecting') {
              updateRelayStatus(url, 'connected'); // Assume connected if no error
            }
          }, 5000);
        } catch (error) {
          console.error(`[v0] Failed to connect to ${url}:`, error);
          updateRelayStatus(url, 'error', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    };

    testConnections();

    // Periodic connection health check
    connectionCheckInterval.current = setInterval(() => {
      relays.current.forEach(async (url) => {
        const status = relayStatuses.get(url);
        if (status?.status === 'error' || status?.status === 'disconnected') {
          console.log(`[v0] Attempting to reconnect to ${url}`);
          updateRelayStatus(url, 'connecting');
          
          try {
            const sub = simplePool.subscribeMany(
              [url],
              [{ kinds: [1], limit: 1 }],
              {
                onevent: () => updateRelayStatus(url, 'connected'),
                oneose: () => {
                  updateRelayStatus(url, 'connected');
                  sub.close();
                }
              }
            );
            
            setTimeout(() => {
              const current = relayStatuses.get(url);
              if (current?.status === 'connecting') {
                updateRelayStatus(url, 'connected');
              }
            }, 3000);
          } catch {
            updateRelayStatus(url, 'error', 'Reconnection failed');
          }
        }
      });
    }, 30000); // Check every 30 seconds

    return () => {
      console.log('[v0] Cleaning up NostrProvider');
      simplePool.close(relays.current);
      reconnectTimeouts.current.forEach(timeout => clearTimeout(timeout));
      if (connectionCheckInterval.current) {
        clearInterval(connectionCheckInterval.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe function
  const subscribe = useCallback((
    filters: Filter[],
    onEvent: (event: Event) => void,
    onEose?: () => void
  ): SubCloser | null => {
    if (!pool) {
      console.warn('[v0] Pool not initialized, cannot subscribe');
      return null;
    }

    console.log('[v0] Creating subscription with filters:', filters);
    
    const sub = pool.subscribeMany(
      relays.current,
      filters,
      {
        onevent: (event) => {
          console.log('[v0] Received event:', event.kind, event.id?.substring(0, 8));
          onEvent(event);
        },
        oneose: () => {
          console.log('[v0] End of stored events');
          onEose?.();
        }
      }
    );

    return sub;
  }, [pool]);

  // Publish function
  const publish = useCallback(async (event: Event): Promise<void> => {
    if (!pool) {
      throw new Error('Pool not initialized');
    }

    console.log('[v0] Publishing event:', event.kind, event.id?.substring(0, 8));
    
    try {
      await Promise.any(pool.publish(relays.current, event));
      console.log('[v0] Event published successfully');
    } catch (error) {
      console.error('[v0] Failed to publish event:', error);
      throw error;
    }
  }, [pool]);

  // Query sync function (for one-time queries)
  const querySync = useCallback(async (filters: Filter[]): Promise<Event[]> => {
    if (!pool) {
      throw new Error('Pool not initialized');
    }

    console.log('[v0] Querying events with filters:', filters);
    
    const events = await pool.querySync(relays.current, ...filters);
    console.log('[v0] Query returned', events.length, 'events');
    return events;
  }, [pool]);

  const value: NostrContextValue = {
    pool,
    relays: relays.current,
    relayStatuses,
    isConnected,
    subscribe,
    publish,
    querySync
  };

  return (
    <NostrContext.Provider value={value}>
      {children}
    </NostrContext.Provider>
  );
}

export function useNostr() {
  const context = useContext(NostrContext);
  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider');
  }
  return context;
}
