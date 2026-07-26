export function Progress({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-9 rounded-full ${i < step ? 'bg-tomato' : 'bg-peach'}`}
          />
        ))}
      </div>
      <span className="font-mono text-sm font-bold text-sand">
        {step}/{total}
      </span>
    </div>
  );
}
