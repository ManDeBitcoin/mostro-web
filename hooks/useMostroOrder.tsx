'use client';

import { useState } from 'react';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { signAsync } from '@noble/secp256k1';

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

  const sendOrder = async (order: OrderPayload): Promise<NostrEvent | null> => {
    const privkey = localStorage.getItem('nostr-privkey');
    const pubkey = localStorage.getItem('nostr-pubkey');

    if (!privkey || !pubkey) {
      setStatus('Missing keys');
      return null;
    }

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

    const rumorEncoded = JSON.stringify(rumor)
    const rumorHash = sha256(new TextEncoder().encode(rumorEncoded))
    const signature = await signAsync(rumorHash, hexToBytes(privkey))
    const r = signature.r.toString(16).padStart(64, '0')
    const s = signature.s.toString(16).padStart(64, '0')
    const fullSig = bytesToHex(new Uint8Array([...hexToBytes(r), ...hexToBytes(s)]))

    rumor.push(`1 ${fullSig}`)
    const content = JSON.stringify(rumor)

    const serialized = [0, pubkey, now, 38383, tags, content]
    const eventHash = sha256(new TextEncoder().encode(JSON.stringify(serialized)))
    const id = bytesToHex(eventHash)
    const eventSigRaw = await signAsync(eventHash, hexToBytes(privkey))
    const r2 = eventSigRaw.r.toString(16).padStart(64, '0')
    const s2 = eventSigRaw.s.toString(16).padStart(64, '0')
    const sig = bytesToHex(new Uint8Array([...hexToBytes(r2), ...hexToBytes(s2)]))

    const event: NostrEvent = {
      kind: 38383,
      created_at: now,
      tags,
      content,
      pubkey,
      id,
      sig,
    };

    // --- CORRECCIÓN: Parseo de la lista de relays ---
    const envRelays = process.env.NEXT_PUBLIC_RELAY_URL || 'wss://relay.mostro.network';
    const relayList = envRelays.split(',').map(url => url.trim());
    const primaryRelay = relayList[0];

    if (!primaryRelay) {
      setStatus('Relay URL is not defined');
      return null;
    }

    const socket = new WebSocket(primaryRelay);

    socket.onopen = () => {
      socket.send(JSON.stringify(['EVENT', event]));
      setStatus('Order sent');
      setLatestOrder(event);

      socket.send(
        JSON.stringify([
          'REQ',
          'order-response',
          {
            kinds: [23196],
            '#e': [event.id],
          },
        ])
      );
    };

    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data[0] === 'EVENT' && data[2]?.kind === 23196) {
        setRelayResponse(data[2]);
        setStatus('Order confirmed by Mostro');
        socket.close();
      }
    };

    socket.onerror = () => {
      setStatus('Relay connection error');
    };

    return event;
  };

  return { sendOrder, status, latestOrder, relayResponse };
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
