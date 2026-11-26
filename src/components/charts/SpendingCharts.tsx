import { useState } from 'react';
import { money, monthLabel, pct } from '@/domain/format';
import type { AlertLevel, Month } from '@/domain/types';
import { AlertBadge, EmptyState, cx } from '@/components/ui/primitives';

const short = (m: Month) => {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
};
/** "R$ 12 mil", "R$ 1,2 mi" para os eixos. */
const compact = (cents: number) => {
  const v = cents / 100;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};
/** Teto "redondo" do eixo (1, 2, 2,5 ou 5 × 10ⁿ). */
const niceMax = (v: number) => {
  if (v <= 0) return 100_000;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v)!;
};

/** Saldo do mês: o Disponível em destaque; limite, consumido e reservado em segundo plano. */
export function BalanceCard({
  month,
  limit,
  consumed,
  reserved,
  available,
  alert,
}: {
  month: Month;
  limit: number;
  consumed: number;
  reserved: number;
  available: number;
  alert: AlertLevel;
}) {
  const base = Math.max(limit, consumed + reserved, 1);
  const used = (consumed + reserved) / (limit || 1);
  return (
    <section className="rounded-lg border bg-card px-6 py-6 sm:px-8" aria-label="Saldo do mês">
      <div className="grid items-end gap-6 md:grid-cols-[minmax(0,auto)_1fr] md:gap-12">
        <div>
          <div className="text-sm text-muted-foreground">Disponível em {monthLabel(month).toLowerCase()}</div>
          <div className={cx('tabular mt-1 text-[44px] font-semibold leading-none tracking-[-0.03em]', available < 0 ? 'text-danger' : 'text-brand')}>{money(available)}</div>
          <div className="tabular mt-2 text-[15px] text-muted-foreground">de {money(limit)} do limite</div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3 text-[13px]">
            <span className="tabular text-muted-foreground">{pct(Math.min(used, 9.99))} em uso</span>
            {alert !== 'ok' && <AlertBadge level={alert} />}
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-track" role="img" aria-label={`Consumido ${money(consumed)}, reservado ${money(reserved)}, de ${money(limit)}`}>
            <div className={cx('h-full', alert === 'over' ? 'bg-status-critical' : 'bg-brand')} style={{ width: `${(consumed / base) * 100}%` }} />
            <div className="h-full bg-brand/35" style={{ width: `${(reserved / base) * 100}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand" />Consumido <strong className="tabular font-semibold">{money(consumed)}</strong></span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand/35" />Reservado <strong className="tabular font-semibold">{money(reserved)}</strong></span>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Gastos por mês (aprovado pela diretoria): uma série, barras com o mês escolhido em destaque.
 * Clicar numa barra escolhe aquele mês (o mesmo seletor do topo).
 */
export function MonthlyChart({ data, selected, onSelect }: { data: { month: Month; consumed: number }[]; selected: Month; onSelect: (m: Month) => void }) {
  const [hover, setHover] = useState<Month | null>(null);
  const top = niceMax(Math.max(...data.map((d) => d.consumed), 0));
  const total = data.reduce((s, d) => s + d.consumed, 0);
  const avg = total / (data.length || 1);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-8 gap-y-1 text-[13px] text-muted-foreground">
        <span>Total no período <strong className="tabular font-semibold text-foreground">{money(total)}</strong></span>
        <span>Média por mês <strong className="tabular font-semibold text-foreground">{money(Math.round(avg))}</strong></span>
      </div>
      <div className="relative flex gap-3">
        {/* eixo */}
        <div className="tabular flex h-80 w-14 shrink-0 flex-col justify-between pb-6 text-right text-[11px] text-muted-foreground" aria-hidden="true">
          <span className="-translate-y-1/2">{compact(top)}</span>
          <span>{compact(top / 2)}</span>
          <span className="translate-y-1/2">R$ 0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%-1.5rem)]" aria-hidden="true">
            <div className="absolute inset-x-0 top-0 border-t border-dashed" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed" />
            <div className="absolute inset-x-0 bottom-0 border-t" />
          </div>
          <ol className="relative flex h-80 items-end gap-1.5 sm:gap-2.5">
            {data.map((d) => {
              const on = d.month === selected;
              const show = hover === d.month;
              const h = (d.consumed / top) * 100;
              return (
                <li key={d.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => onSelect(d.month)}
                    onMouseEnter={() => setHover(d.month)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(d.month)}
                    onBlur={() => setHover(null)}
                    aria-pressed={on}
                    aria-label={`${monthLabel(d.month)}: ${money(d.consumed)}`}
                    className="group relative flex h-[calc(100%-1.5rem)] w-full items-end justify-center rounded-t-[5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cx('block w-full max-w-[40px] rounded-t-[5px] transition-colors', on ? 'bg-brand' : 'bg-brand/25 group-hover:bg-brand/45')}
                      style={{ height: `${Math.max(d.consumed ? 1.5 : 0, h)}%` }}
                    />
                    {(show || (on && !hover)) && (
                      <span className="tabular pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-[12px] font-medium shadow-pop" style={{ bottom: `${h}%` }}>
                        {money(d.consumed)}
                      </span>
                    )}
                  </button>
                  <span className={cx('mt-2 h-4 truncate text-center text-[12px]', on ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{short(d.month)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Gastos por natureza no mês: barras horizontais do maior para o menor. Clicar abre o detalhe da natureza. */
export function NatureChart({ data, name, onPick }: { data: { natureId: string | null; consumed: number }[]; name: (id: string | null) => string; onPick?: (id: string | null) => void }) {
  const total = data.reduce((s, d) => s + d.consumed, 0);
  const max = data[0]?.consumed ?? 0;
  if (!data.length) return <EmptyState title="Nenhum gasto aprovado neste mês." />;
  return (
    <ul className="-mx-2 grid gap-x-8 gap-y-1 md:grid-cols-2">
      {data.map((d) => (
        <li key={d.natureId ?? 'sem'}>
          <button
            type="button"
            onClick={onPick ? () => onPick(d.natureId) : undefined}
            disabled={!onPick}
            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-foreground/[0.04] disabled:hover:bg-transparent"
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{name(d.natureId)}</span>
              <span className="tabular shrink-0">
                <strong className="font-semibold">{money(d.consumed)}</strong>
                <span className="ml-2 text-[13px] text-muted-foreground">{pct(d.consumed / total)}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-track">
              <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(2, (d.consumed / max) * 100)}%` }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
