import { dateTime } from '@/domain/format';
import type { HistoryEntry } from '@/domain/types';

export function History({ items }: { items: HistoryEntry[] }) {
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {items.map((h, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary ring-1 ring-border" />
          <div className="text-sm font-medium">{h.action}</div>
          <div className="text-xs text-muted-foreground">
            {h.userName} · {dateTime(h.at)}
          </div>
          {h.note && <div className="mt-1 rounded-md bg-muted px-2 py-1 text-xs">“{h.note}”</div>}
        </li>
      ))}
    </ol>
  );
}

export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}
