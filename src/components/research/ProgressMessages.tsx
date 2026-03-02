interface ProgressMessagesProps {
  messages: string[];
}

export function ProgressMessages({ messages }: ProgressMessagesProps) {
  if (messages.length === 0) return null;

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4 max-h-40 overflow-y-auto">
      <h3 className="text-sm font-medium text-zinc-300 mb-2">
        Research Progress
      </h3>
      {messages.map((msg, i) => (
        <p key={i} className="text-xs text-zinc-400 font-mono">
          {msg}
        </p>
      ))}
    </div>
  );
}
