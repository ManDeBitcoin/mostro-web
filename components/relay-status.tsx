'use client';

import { useNostr, type RelayStatus } from '@/lib/nostr';
import { Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';

interface RelayStatusIndicatorProps {
  /** Show detailed status for each relay */
  detailed?: boolean;
  /** Compact mode - just show icon */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

const statusConfig: Record<RelayStatus, { color: string; icon: typeof Wifi; label: string }> = {
  disconnected: { color: 'text-neutral-500', icon: WifiOff, label: 'Disconnected' },
  connecting: { color: 'text-yellow-500', icon: Loader2, label: 'Connecting...' },
  connected: { color: 'text-lime-500', icon: Wifi, label: 'Connected' },
  error: { color: 'text-red-500', icon: AlertCircle, label: 'Error' }
};

export function RelayStatusIndicator({ 
  detailed = false, 
  compact = false,
  className = '' 
}: RelayStatusIndicatorProps) {
  const { relayStatuses, isConnected, relays } = useNostr();

  // Calculate overall status
  const connectedCount = Array.from(relayStatuses.values()).filter(
    r => r.status === 'connected'
  ).length;
  const totalCount = relays.length;

  const overallStatus: RelayStatus = connectedCount === totalCount 
    ? 'connected' 
    : connectedCount > 0 
      ? 'connected' 
      : Array.from(relayStatuses.values()).some(r => r.status === 'connecting')
        ? 'connecting'
        : Array.from(relayStatuses.values()).some(r => r.status === 'error')
          ? 'error'
          : 'disconnected';

  const config = statusConfig[overallStatus];
  const Icon = config.icon;

  if (compact) {
    return (
      <div className={`flex items-center ${className}`} title={`${connectedCount}/${totalCount} relays connected`}>
        <Icon 
          className={`w-4 h-4 ${config.color} ${overallStatus === 'connecting' ? 'animate-spin' : ''}`} 
        />
      </div>
    );
  }

  if (!detailed) {
    return (
      <div className={`flex items-center gap-2 text-sm font-mono ${className}`}>
        <Icon 
          className={`w-4 h-4 ${config.color} ${overallStatus === 'connecting' ? 'animate-spin' : ''}`} 
        />
        <span className={config.color}>
          {connectedCount}/{totalCount} {config.label}
        </span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-mono">
        <Icon 
          className={`w-4 h-4 ${config.color} ${overallStatus === 'connecting' ? 'animate-spin' : ''}`} 
        />
        <span className={config.color}>
          Relays: {connectedCount}/{totalCount} connected
        </span>
      </div>
      
      <div className="space-y-1 pl-6">
        {Array.from(relayStatuses.entries()).map(([url, info]) => {
          const relayConfig = statusConfig[info.status];
          const RelayIcon = relayConfig.icon;
          
          return (
            <div 
              key={url} 
              className="flex items-center gap-2 text-xs font-mono text-neutral-400"
            >
              <RelayIcon 
                className={`w-3 h-3 ${relayConfig.color} ${info.status === 'connecting' ? 'animate-spin' : ''}`} 
              />
              <span className="truncate max-w-[200px]" title={url}>
                {url.replace('wss://', '')}
              </span>
              {info.error && (
                <span className="text-red-400 text-xs">({info.error})</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Simple badge showing connection status */
export function RelayStatusBadge({ className = '' }: { className?: string }) {
  const { isConnected, relayStatuses, relays } = useNostr();
  
  const connectedCount = Array.from(relayStatuses.values()).filter(
    r => r.status === 'connected'
  ).length;

  return (
    <div 
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono
        ${isConnected 
          ? 'bg-lime-500/10 text-lime-500 border border-lime-500/20' 
          : 'bg-red-500/10 text-red-500 border border-red-500/20'
        }
        ${className}
      `}
    >
      <span 
        className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-lime-500' : 'bg-red-500'}`} 
      />
      {connectedCount}/{relays.length}
    </div>
  );
}
