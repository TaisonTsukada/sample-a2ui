import { useState, useCallback, useRef, useEffect, FormEvent } from 'react';
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
} from '@a2ui/react';
import type { Types } from '@a2ui/react';

const SESSION_ID = `session-${Date.now()}`;

export function App() {
  const sendAndProcessRef = useRef<
    ((message: Types.A2UIClientEventMessage | string) => Promise<void>) | null
  >(null);

  const handleAction = useCallback((actionMessage: Types.A2UIClientEventMessage) => {
    console.log('User action:', actionMessage);
    sendAndProcessRef.current?.(JSON.stringify(actionMessage));
  }, []);

  return (
    <A2UIProvider onAction={handleAction}>
      <ShellContent sendAndProcessRef={sendAndProcessRef} />
    </A2UIProvider>
  );
}

interface ShellContentProps {
  sendAndProcessRef: React.MutableRefObject<
    ((message: Types.A2UIClientEventMessage | string) => Promise<void>) | null
  >;
}

function ShellContent({ sendAndProcessRef }: ShellContentProps) {
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string>('');
  const { processMessages, clearSurfaces, getSurfaces } = useA2UIActions();

  const sendAndProcess = useCallback(
    async (message: Types.A2UIClientEventMessage | string) => {
      try {
        setRequesting(true);
        setError(null);

        const body = typeof message === 'string' ? message : JSON.stringify(message);

        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: body, session_id: SESSION_ID }),
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

        const data = await res.json();
        console.log('Agent response:', data);

        setResponseText(data.text || '');
        clearSurfaces();
        if (data.messages && data.messages.length > 0) {
          processMessages(data.messages);
        }
      } catch (err) {
        console.error('Error:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setRequesting(false);
      }
    },
    [clearSurfaces, processMessages]
  );

  useEffect(() => {
    sendAndProcessRef.current = sendAndProcess;
  }, [sendAndProcess, sendAndProcessRef]);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const message = formData.get('message') as string;
      if (!message?.trim()) return;
      (e.currentTarget.elements.namedItem('message') as HTMLInputElement).value = '';
      sendAndProcess(message);
    },
    [sendAndProcess]
  );

  const surfaces = getSurfaces();
  const surfaceEntries = Array.from(surfaces.entries());

  return (
    <div className="shell">
      <h1 className="title">Todo Agent</h1>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          name="message"
          type="text"
          placeholder="例: タスク一覧を見せて / Buy milk を追加"
          disabled={requesting}
          autoComplete="off"
        />
        <button type="submit" disabled={requesting}>
          {requesting ? '...' : '送信'}
        </button>
      </form>

      {requesting && <div className="loading">考え中...</div>}
      {error && <div className="error">{error}</div>}
      {responseText && !requesting && (
        <div className="response-text">{responseText}</div>
      )}

      {!requesting && surfaceEntries.length > 0 && (
        <section className="surfaces">
          {surfaceEntries.map(([surfaceId]) => (
            <A2UIRenderer key={surfaceId} surfaceId={surfaceId} />
          ))}
        </section>
      )}
    </div>
  );
}
