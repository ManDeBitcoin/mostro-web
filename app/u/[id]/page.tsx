'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/header'

export default function UserProfile() {
  const router = useRouter()
  const params = useParams()
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id
  interface UserOrder {
    id: string
    type: string
    amount: number
    [key: string]: string | number | boolean | null | undefined // Adjust this to match the exact structure of your order data
  }

  const [userOrders, setUserOrders] = useState<UserOrder[]>([])
  const [relayStatus, setRelayStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')

  useEffect(() => {
    const RELAY = process.env.NEXT_PUBLIC_RELAY_URL 
    if (!RELAY) {
      console.error('Relay URL is not defined')
      setRelayStatus('error')
      return
    }
    const socket = new WebSocket(RELAY)
  
    socket.onopen = () => {
      setRelayStatus('connected')
  
      // Enviamos un REQ simple a cualquier kind para testear respuesta
      const testSub = [
        'test-sub',
        {
          kinds: [1] // kind 1 = note (lo más común)
        }
      ]
      socket.send(JSON.stringify(['REQ', ...testSub]))
    }
    socket.onmessage = (msg) => {
      const data = JSON.parse(msg.data)
      if (data[0] === 'EVENT') {
        const event = data[2]
        console.log('Received event:', event)
      }
    }
  
    socket.onerror = () => setRelayStatus('error')
  
    return () => socket.close()
  }, [])

  const [isReady, setIsReady] = useState(false)
  const [isCurrentUser, setIsCurrentUser] = useState(false)
  const [localData, setLocalData] = useState<{
    mnemonic?: string
    privkey?: string
    pubkey?: string
    npub?: string
  }>({})

  useEffect(() => {
    if (!id) return 
    console.log('param id:', id)
    console.log('stored npub:', localStorage.getItem('nostr-npub'))

    const npub = localStorage.getItem('nostr-npub')
    const pubkey = localStorage.getItem('nostr-pubkey')
    const privkey = localStorage.getItem('nostr-privkey')
    const mnemonic = localStorage.getItem('nostr-mnemonic')

    const isSelf = npub === id
    setIsCurrentUser(isSelf)

    if (isSelf) {
      setLocalData({
        pubkey: pubkey ?? undefined,
        npub: npub ?? undefined,
        privkey: privkey ?? undefined,
        mnemonic: mnemonic ?? undefined,
      })
    } else {
      setLocalData({ npub: id })
    }

    setIsReady(true)
  }, [id])

  useEffect(() => {
    if (!isCurrentUser || !localData.pubkey) return
  
    const socket = new WebSocket('wss://relay.mostro.network')
  
    socket.onopen = () => {
      const filter = {
        kinds: [38383], // Kind de órdenes según Mostro
        authors: [localData.pubkey] // clave pública hex
      }
      socket.send(JSON.stringify(['REQ', 'user-orders-sub', filter]))
    }
  
    socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)
        if (data[0] === 'EVENT') {
          const event = data[2]
          const content = JSON.parse(event.content)
          setUserOrders(prev => [...prev, content])
        }
      } catch (e) {
        console.error('Error parsing order from relay:', e)
      }
    }
  
    return () => {
      socket.close()
    }
  }, [isCurrentUser, localData.pubkey])
  

  const handleLogout = () => {
    // Eliminar todas las claves relacionadas
    localStorage.removeItem('nostr-npub')
    localStorage.removeItem('nostr-pubkey')
    localStorage.removeItem('nostr-privkey')
    localStorage.removeItem('nostr-mnemonic')

    router.push('/') // redirigir al home
  }

  if (!isReady) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-500 font-mono">Loading profile...</p>
      </div>
    )
  }

  return (
    <div className="min-w-screen min-h-screen bg-[#101010] text-white font-mono max-w-2xl mx-auto space-y-6 py-20">
      <Header />
      <div className="lg:w-1/3 mx-auto">
        <h1 className="text-3xl font-bold mb-8">Profile</h1>

        <div className="bg-neutral-900 border border-neutral-700 p-4 rounded space-y-2 mb-2">
          <p className="text-gray-400 text-sm">npub:</p>
          <p className="break-words text-blue-400 text-sm">{id}</p>
        </div>

        {isCurrentUser && (
          <>
            <div className="bg-neutral-900 border border-neutral-700 p-4 rounded space-y-2 mb-2">
              <p className="text-gray-400 text-sm">Public Key (hex):</p>
              <p className="break-words text-lime-400 text-sm">{localData.pubkey}</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-700 p-4 rounded space-y-2 mb-2">
              <p className="text-gray-400 text-sm">Private Key:</p>
              <p className="break-words text-red-400 text-sm">{localData.privkey}</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-700 p-4 rounded space-y-2 mb-2">
              <p className="text-gray-400 text-sm">Mnemonic Phrase:</p>
              <p className="break-words text-white text-sm">{localData.mnemonic}</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-700 p-4 rounded text-sm mt-8">
              <p className="text-lime-400">Relay Status: {relayStatus}</p>
            </div>

            {isCurrentUser && userOrders.length > 0 && (
              <div className="mt-12 space-y-4">
                <h2 className="text-xl font-bold">My Orders from Mostro Relay</h2>
                {userOrders.map((order, i) => (
                  <div key={i} className="bg-neutral-900 border border-neutral-700 p-4 rounded text-sm">
                    <pre className="text-white whitespace-pre-wrap break-words">{JSON.stringify(order, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-center">
              <button
                onClick={handleLogout}
                className="hover:bg-red-500 hover:text-white border border-red-500 text-red-500 px-4 py-2 rounded font-bold w-full cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </>
        )}

        {!isCurrentUser && (
          <div className="bg-neutral-900 border border-neutral-700 p-4 rounded space-y-2 mb-2">
            <p className="text-gray-400 text-sm">This is a public profile. You can follow this user.</p>
          </div>
        )}
      </div>
    </div>
  )
}
