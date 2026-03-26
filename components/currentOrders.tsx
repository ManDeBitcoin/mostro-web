'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';

interface MostroOrderEvent {
  id: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey: string;
  sig: string;
}

export default function CurrentOrders() {
  const [orders, setOrders] = useState<MostroOrderEvent[]>([]);
  const [relayStatus, setRelayStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    const envRelays = process.env.NEXT_PUBLIC_RELAY_URL || 'wss://relay.mostro.network';
    const primaryRelay = envRelays.split(',')[0].trim();

    if (!primaryRelay) {
      setRelayStatus('error');
      return;
    }

    const socket = new WebSocket(primaryRelay);

    socket.onopen = () => {
      setRelayStatus('connected');
      const req = ['REQ', 'mostro-orders', { kinds: [38383], limit: 30 }];
      socket.send(JSON.stringify(req));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data[0] === 'EVENT' && data[2]?.kind === 38383) {
          const newOrder = data[2];
          setOrders((prev) => {
            if (prev.find(o => o.id === newOrder.id)) return prev;
            return [newOrder, ...prev].sort((a, b) => b.created_at - a.created_at);
          });
        }
      } catch (error) {
        console.error('[Relay] Error:', error);
      }
    };

    socket.onerror = () => setRelayStatus('error');
    return () => socket.close();
  }, []);

  const getVal = (tags: string[][], key: string) => tags.find(t => t[0] === key);

  return (
    <div className="p-6 max-w-4xl mx-auto text-white space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">P2P Order Book</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${relayStatus === 'connected' ? 'bg-lime-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-400 uppercase">{relayStatus}</span>
        </div>
      </div>

      {relayStatus === 'connecting' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-8 h-8 border-4 border-lime-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Sincronizando con Nostr...</p>
        </div>
      )}

      {orders.length === 0 && relayStatus === 'connected' && (
        <div className="text-center py-20 border-2 border-dashed border-neutral-800 rounded-xl">
          <p className="text-gray-500">No hay órdenes activas.</p>
        </div>
      )}

      <div className="grid gap-4">
        {orders.map((order) => {
          const type = getVal(order.tags, 'k')?.[1] || 'buy';
          const fiat = getVal(order.tags, 'f')?.[1] || 'USD';
          const minAmount = getVal(order.tags, 'fa')?.[1];
          const maxAmount = getVal(order.tags, 'fa')?.[2];
          const method = getVal(order.tags, 'pm')?.[1] || 'Múltiples métodos';
          const premium = getVal(order.tags, 'premium')?.[1] || '0';
          const isBuy = type.toLowerCase() === 'buy';

          return (
            <Card key={order.id} className="bg-neutral-900 border-neutral-700 hover:border-lime-500/50 transition-all cursor-pointer group">
              <CardContent className="p-0 flex">
                <div className={`w-1.5 ${isBuy ? 'bg-lime-500' : 'bg-red-500'} shrink-0`} />
                <div className="p-5 w-full">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      {/* Badge manual sin dependencias */}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isBuy ? 'bg-lime-500/10 text-lime-500' : 'bg-red-500/10 text-red-500'}`}>
                        {isBuy ? 'COMPRA' : 'VENTA'}
                      </span>
                      <div className="text-2xl font-black text-white">
                        {fiat} {minAmount} {maxAmount ? `- ${maxAmount}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${Number(premium) >= 0 ? 'text-red-400' : 'text-lime-400'}`}>
                        {premium}% {Number(premium) >= 0 ? 'sobre' : 'bajo'} mercado
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 uppercase">
                        {new Date(order.created_at * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/40 rounded-lg p-3 border border-neutral-800/50 mb-4">
                    <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Método de Pago</span>
                    <p className="text-sm text-gray-300 line-clamp-2 whitespace-pre-line text-xs">
                      {method}
                    </p>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="text-[10px] text-neutral-600 font-mono">
                      ID: {order.id.slice(0, 12)}...
                    </div>
                    <button className="text-xs font-bold text-lime-500 group-hover:underline">
                      TOMAR ORDEN →
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
