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

// Mirror the same logic as api.ts — production uses Render, local uses localhost
const SSE_BASE =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://ledgerline-4lnt.onrender.com'
    : 'http://localhost:5000';

/**
 * useSSE — manages a Server-Sent Events connection to /api/events.
 * Automatically reconnects on disconnect with exponential backoff.
 */
export function useSSE(onAlert: (alert: SSEAlert) => void) {
  const esRef    = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();

    const token = localStorage.getItem('token');
    const url   = token
      ? `${SSE_BASE}/api/events?token=${encodeURIComponent(token)}`
      : `${SSE_BASE}/api/events`;

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => { attemptsRef.current = 0; };

    es.onmessage = (event) => {
      try {
        const data: SSEAlert = JSON.parse(event.data);
        if (data.transactionId) onAlert(data);
      } catch {
        // Heartbeat or malformed message — ignore
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      const delay = Math.min(2000 * Math.pow(2, attemptsRef.current), 30000);
      attemptsRef.current++;
      retryRef.current = setTimeout(connect, delay);
    };
  }, [onAlert]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current)  esRef.current.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);
}
