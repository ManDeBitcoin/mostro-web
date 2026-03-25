'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { signAsync } from '@noble/secp256k1';
import { useNostr, useNostrSubscription } from '@/lib/nostr';
import type { Event } from 'nostr-tools';

interface OrderPayload {
  type: string;
  amount: number;
  fiat_code: string;
  payment_method: string;
  premium: number;
}

export interface NostrEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
  id: string;
  sig: string;
}

export function useMostroOrder() {
  const [status, setStatus] = useState<string | null>(null);
  const [latestOrder, setLatestOrder] = useState<NostrEvent | null>(null);
  const [relayResponse, setRelayResponse] = useState<NostrEvent | null>(null);
  const [waitingForEventId, setWaitingForEventId] = useState<string | null>(null);
  
  const { publish, isConnected } = useNostr();

  // Subscribe to order responses when we're waiting for one
  const responseFilters = useMemo(() => {
    if (!waitingForEventId) return [];
    return [{
      kinds: [23196],
      '#e': [waitingForEventId],
    }];
  }, [waitingForEventId]);

  const { events: responses } = useNostrSubscription<Event>(responseFilters, {
    enabled: !!waitingForEventId,
  });

  // Handle response when it comes in
  useEffect(() => {
    if (responses.length > 0 && waitingForEventId) {
      const response = responses[0] as unknown as NostrEvent;
      setRelayResponse(response);
      setStatus('Order confirmed by Mostro');
      setWaitingForEventId(null);
    }
  }, [responses, waitingForEventId]);

  const sendOrder = useCallback(async (order: OrderPayload): Promise<string | null> => {
    if (!isConnected) {
      setStatus('Not connected to relay');
      return null;
    }

    const privkey = localStorage.getItem('nostr-privkey');
    const pubkey = localStorage.getItem('nostr-pubkey');

    if (!privkey || !pubkey) {
      setStatus('Missing keys');
      return null;
    }

    setStatus('Creating order...');

    const now = Math.floor(Date.now() / 1000);
    const orderId = crypto.randomUUID();
    const tags: string[][] = [['d', orderId]];

    const rumor: (object | string)[] = [
      {
        order: {
          version: 1,
          action: 'new-order',
          trade_index: 1,
          payload: {
            order: {
              kind: order.type,
              status: 'pending',
              amount: 0,
              fiat_code: order.fiat_code,
              fiat_amount: order.amount,
              payment_method: order.payment_method,
              premium: order.premium,
              created_at: now,
            },
          },
        },
      },
    ];

    const rumorEncoded = JSON.stringify(rumor);
    const rumorHash = sha256(new TextEncoder().encode(rumorEncoded));
    const signature = await signAsync(rumorHash, hexToBytes(privkey));
    const r = signature.r.toString(16).padStart(64, '0');
    const s = signature.s.toString(16).padStart(64, '0');
    const fullSig = bytesToHex(new Uint8Array([...hexToBytes(r), ...hexToBytes(s)]));

    rumor.push(`1 ${fullSig}`);
    const content = JSON.stringify(rumor);

    const serialized = [0, pubkey, now, 38383, tags, content];
    const eventHash = sha256(new TextEncoder().encode(JSON.stringify(serialized)));
    const id = bytesToHex(eventHash);
    const eventSigRaw = await signAsync(eventHash, hexToBytes(privkey));
    const r2 = eventSigRaw.r.toString(16).padStart(64, '0');
    const s2 = eventSigRaw.s.toString(16).padStart(64, '0');
    const sig = bytesToHex(new Uint8Array([...hexToBytes(r2), ...hexToBytes(s2)]));

    const event: NostrEvent = {
      kind: 38383,
      created_at: now,
      tags,
      content,
      pubkey,
      id,
      sig,
    };

    try {
      setStatus('Publishing order...');
      await publish(event as unknown as Event);
      
      setStatus('Order sent');
      setLatestOrder(event);
      
      // Start listening for response
      setWaitingForEventId(event.id);
      
      return event.id;
    } catch (error) {
      console.error('Failed to publish order:', error);
      setStatus('Failed to send order');
      return null;
    }
  }, [isConnected, publish]);

  return { 
    sendOrder, 
    status, 
    latestOrder, 
    relayResponse,
    isConnected 
  };
}

export function MostroOrderStatus({ status }: { status: string | null }) {
  return (
    <div className="text-sm text-center text-white font-mono mt-2">
      {status && <p>Status: {status}</p>}
    </div>
  );
}

export function MostroOrderPreview({ order }: { order: NostrEvent | null }) {
  if (!order) return null;

  return (
    <div className="mt-6 p-4 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono">
      <p className="text-lime-400 font-bold mb-2">Latest Order Preview</p>
      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(order, null, 2)}</pre>
    </div>
  );
}

export function MostroRelayResponse({ response }: { response: NostrEvent | null }) {
  if (!response) return null;

  return (
    <div className="mt-4 p-4 bg-neutral-900 border border-neutral-700 rounded text-sm text-white font-mono">
      <p className="text-blue-400 font-bold mb-2">Mostro Relay Response</p>
      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(response, null, 2)}</pre>
    </div>
  );
}
