import { useState } from 'react';
import { money, pct } from '@/domain/format';
import { EmptyState } from '@/components/ui/primitives';

export interface BarItem {
  key: string;
  label: string;
  value: number;
}

/**
 * Ranking em barras horizontais (magnitude → matiz único).
 * Rótulo e valor ficam em tinta de texto; a barra só carrega magnitude.
 * Hover/foco exibem valor exato e participação no total.
 */
export function BarList({ items, emptyText = 'Sem gastos no período.' }: { items: BarItem[]; emptyText?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value ?? 0;
  const total = sorted.reduce((s, i) => s + i.value, 0);
  if (!sorted.length) return <EmptyState title={emptyText} />;
  return (
    <ul className="space-y-3" role="list">
      {sorted.map((it, idx) => {
        const isActive = active === it.key;
        return (
          <li
            key={it.key}
            tabIndex={0}
            onMouseEnter={() => setActive(it.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(it.key)}
            onBlur={() => setActive(null)}
            className="group relative -mx-2 cursor-default rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${it.label}: ${money(it.value)}, ${pct(it.value / total)} do total`}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">
                <span className="mr-2 text-xs tabular text-muted-foreground">{idx + 1}.</span>
                {it.label}
              </span>
              <span className="tabular shrink-0 font-medium">{money(it.value)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-2 rounded-full transition-colors ${active && !isActive ? 'bg-series/40' : 'bg-series'}`}
                style={{ width: `${Math.max(1.5, (it.value / max) * 100)}%` }}
              />
            </div>
            {isActive && (
              <div className="pointer-events-none absolute right-2 top-full z-10 mt-1 rounded-md border bg-white px-3 py-2 text-xs shadow-lg">
                <div className="font-medium">{it.label}</div>
                <div className="tabular text-muted-foreground">
                  {money(it.value)} · {pct(it.value / total)} do total
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
