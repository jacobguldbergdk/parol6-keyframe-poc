'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useRobotWebSocket, LogEntry } from '../hooks/useRobotWebSocket';

export default function CommandLog() {
  // Connect to WebSocket and subscribe to logs (INFO and above only)
  const { logs, clearLogs, isConnected } = useRobotWebSocket(undefined, {
    topics: ['logs'],
    logLevel: 'INFO', // Filter out DEBUG logs
  });

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new logs are added (newest first)
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs]);

  const handleClearLog = () => {
    clearLogs();
  };

  const getLevelColor = (level: LogEntry['level']): string => {
    switch (level) {
      case 'CRITICAL':
      case 'ERROR':
        return 'text-red-500';
      case 'WARNING':
        return 'text-yellow-500';
      case 'INFO':
        return 'text-blue-500';
      default:
        return 'text-foreground';
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    // Format backend timestamp to HH:MM:SS
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { hour12: false });
    } catch {
      return timestamp;
    }
  };

  return (
    <Card className="p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Command Log</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearLog}
          className="h-6 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>

      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto space-y-0.5 font-mono text-xs bg-secondary/20 rounded-md p-2"
      >
        {logs.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">
            {isConnected ? 'No log entries yet' : 'Connecting to log stream...'}
          </div>
        ) : (
          [...logs].reverse().map((log, index) => (
            <div key={`${log.timestamp}-${index}`} className="flex gap-2">
              <span className="text-muted-foreground">[{formatTimestamp(log.timestamp)}]</span>
              <span className={getLevelColor(log.level)}>
                [{log.level}] {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
