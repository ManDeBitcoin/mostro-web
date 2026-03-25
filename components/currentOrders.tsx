'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { RelayStatusIndicator } from '@/components/relay-status';
import { useNostrSubscription } from '@/lib/nostr';
import { Loader2 } from 'lucide-react';
import type { Event } from 'nostr-tools';

interface MostroOrderEvent extends Event {
  id: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey: string;
  sig: string;
}

export default function CurrentOrders() {
  // Define filters for Mostro orders (kind 38383)
  const filters = useMemo(() => [
    {
      kinds: [38383],
      limit: 20
    }
  ], []);

  const { events: orders, isLoading, isConnected } = useNostrSubscription<MostroOrderEvent>(filters);

  return (
    <div className="p-6 max-w-4xl mx-auto text-white space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Live Orders</h2>
        <RelayStatusIndicator compact />
      </div>

      {!isConnected && (
        <div className="flex items-center justify-center py-12 gap-2 text-neutral-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Connecting to relay...</span>
        </div>
      )}

      {isConnected && isLoading && (
        <div className="flex items-center justify-center py-12 gap-2 text-neutral-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading orders...</span>
        </div>
      )}

      {isConnected && !isLoading && orders.length === 0 && (
        <p className="text-gray-400">No open orders found from Mostro daemon.</p>
      )}

      {orders.map((order, index) => (
        <Card key={`${order.id}-${index}`} className="bg-neutral-900 border border-neutral-700">
          <CardContent className="p-4 text-sm font-mono text-white">
            <div className="text-lime-400 font-bold mb-2">Raw JSON Event</div>
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(order, null, 2)}</pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
