'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface SSEAlert {
  userId: number;
  transactionId: number;
  alertType: string;
  severity: string;
  message: string;
  merchant: string;
  amount: number;
}

/**
 * useSSE — manages a Server-Sent Events connection to /api/events.
 * Automatically reconnects on disconnect. Calls onAlert for each event.
 */
export function useSSE(onAlert: (alert: SSEAlert) => void) {
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource('http://localhost:5000/api/events');
    esRef.current = es;

    es.onopen = () => {
      attemptsRef.current = 0;
    };

    es.onmessage = (event) => {
      try {
        const data: SSEAlert = JSON.parse(event.data);
        if (data.transactionId) {
          onAlert(data);
        }
      } catch {
        // Heartbeat or malformed message — ignore
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Exponential backoff: 2s, 4s, 8s … max 30s
      const delay = Math.min(2000 * Math.pow(2, attemptsRef.current), 30000);
      attemptsRef.current++;
      retryRef.current = setTimeout(connect, delay);
    };
  }, [onAlert]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) esRef.current.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);
}
