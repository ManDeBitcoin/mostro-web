'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/header';
import { Card, CardContent } from '@/components/ui/card';

interface MostroOrderEvent {
  id: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey: string;
  sig: string;
}

export default function OrderDetailsPage() {
  const params = useParams();
  const id = decodeURIComponent(Array.isArray(params?.id) ? params.id[0] : params?.id || '');
  const [order, setOrder] = useState<MostroOrderEvent | null>(null);
  const [relayConnected, setRelayConnected] = useState(false);

  useEffect(() => {
    if (!id) return;

    console.log('Listening for order ID:', id);
    
    // --- CORRECCIÓN: Parseo de la lista de relays ---
    const envRelays = process.env.NEXT_PUBLIC_RELAY_URL || 'wss://relay.mostro.network';
    const relayList = envRelays.split(',').map(url => url.trim());
    const primaryRelay = relayList[0];

    console.log('Primary Relay URL:', primaryRelay);

    if (!primaryRelay) {
      console.error('Relay URL is not defined');
      return;
    }

    const socket = new WebSocket(primaryRelay);

    socket.onopen = () => {
      setRelayConnected(true);
      console.log('Connected to relay, sending subscription for order');

      const req = [
        'REQ',
        'order-detail',
        {
          kinds: [38383],
          '#d': [id],
        },
      ];

      console.log('Sending subscription request with filters:', req[2]);
      socket.send(JSON.stringify(req));
    };

    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      console.log('Received data from relay:', data);

      if (data[0] === 'EVENT' && data[2]?.kind === 38383) {
        console.log('Matching event received:', data[2]);
        setOrder(data[2]);
        socket.close();
      } else if (data[0] === 'EOSE') {
        console.log('End of subscription event received');
      } else {
        console.warn('Unexpected message from relay:', data);
      }
    };

    socket.onerror = () => {
      console.error('WebSocket connection error');
      setRelayConnected(false);
    };

    return () => socket.close();
  }, [id]);

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      <Header />
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 break-words">
          Order <br />
          <span className="text-sm">#{id}</span>
        </h1>

        {!order && relayConnected && (
          <p className="text-gray-400">No matching order found. Please try again later.</p>
        )}

        {!relayConnected && (
          <p className="text-red-500">Connecting to relay...</p>
        )}

        {order ? (
          <>
            <Card className="bg-neutral-900 border border-neutral-700 mb-4">
              <CardContent className="p-4 space-y-2">
                <p><strong>Pubkey:</strong> {order.pubkey}</p>
                <p><strong>Created At:</strong> {new Date(order.created_at * 1000).toLocaleString()}</p>
                <p><strong>Tags:</strong> {JSON.stringify(order.tags)}</p>
                <p><strong>Signature:</strong> {order.sig}</p>
              </CardContent>
            </Card>

            <div className="bg-neutral-950 border border-neutral-700 p-4 rounded">
              <p className="text-lime-400 font-bold mb-2">Raw Order JSON:</p>
              <pre className="text-sm text-white whitespace-pre-wrap break-words">
                {JSON.stringify(order, null, 2)}
              </pre>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
