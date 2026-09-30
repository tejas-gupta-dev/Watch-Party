import { useEffect, useRef, useState, type FormEvent } from 'react';
import { REACTIONS } from '@watch-party/shared';
import type { RoomActions } from '../realtime/useRoomSocket';
import { useRoomStore } from '../store/roomStore';

export default function ChatPanel({ actions }: { actions: RoomActions }) {
  const chat = useRoomStore((s) => s.chat);
  const me = useRoomStore((s) => s.me);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [chat.length]);

  function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    actions.chat(t);
    setText('');
  }

  return (
    <section className="panel chat">
      <h2>Chat</h2>
      <div className="msgs" role="log" aria-live="polite">
        {chat.length === 0 && <p className="muted">Say something. Everyone in the room will see it.</p>}
        {chat.map((m) => (
          <p key={m.id} className={m.userId === me?.id ? 'msg mine' : 'msg'}><strong>{m.username}</strong> {m.text}</p>
        ))}
        <div ref={end} />
      </div>
      <div className="reacts">
        {REACTIONS.map((r) => <button key={r} className="react" onClick={() => actions.react(r)} aria-label={`React ${r}`}>{r}</button>)}
      </div>
      <form className="row" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" maxLength={500} aria-label="Message" />
        <button className="primary">Send</button>
      </form>
    </section>
  );
}
