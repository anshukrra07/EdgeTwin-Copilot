import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url) {
  const [data, setData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const reconnectDelay = useRef(1000); // Start reconnect at 1s
  const MAX_RECONNECT_DELAY = 30000;

  const connect = useCallback(() => {
    if (ws.current) {
      ws.current.close();
    }

    console.log(`Connecting to WebSocket: ${url}`);
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connection established.');
      setIsConnected(true);
      setError(null);
      reconnectDelay.current = 1000; // Reset reconnect delay on success
    };

    socket.onmessage = (event) => {
      try {
        const parsedData = JSON.parse(event.data);
        setData(parsedData);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError(err);
    };

    socket.onclose = (event) => {
      console.log(`WebSocket closed (code: ${event.code}). Attempting reconnect...`);
      setIsConnected(false);
      
      // Schedule reconnect with exponential backoff
      reconnectTimeout.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY);
        connect();
      }, reconnectDelay.current);
    };
  }, [url]);

  useEffect(() => {
    connect();

    return () => {
      if (ws.current) {
        // Remove close listener so it doesn't trigger reconnect on component unmount
        ws.current.onclose = null;
        ws.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((msg) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    } else {
      console.warn('Cannot send message, WebSocket is not open.');
    }
  }, []);

  return { data, isConnected, error, sendMessage };
}
