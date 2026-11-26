import { useId, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, type TooltipProps } from 'recharts';
import { useQuery, useUser } from '@/app/session';
import { money } from '@/domain/format';
import { api } from '@/services/api';
import { cx } from '@/components/ui/primitives';

type Range = 90 | 30 | 7;
const RANGES: { value: Range; label: string; short: string }[] = [
  { value: 90, label: 'Últimos 3 meses', short: '3 meses' },
  { value: 30, label: 'Últimos 30 dias', short: '30 dias' },
  { value: 7, label: 'Últimos 7 dias', short: '7 dias' },
];

/** "2026-04-02" → data local (sem o deslocamento de fuso do `new Date(string)`). */
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const tick = (iso: string) => parse(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '').replace(' de ', ' ');
const long = (iso: string) => {
  const t = parse(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'long' }).replace('.', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const BRAND = 'hsl(var(--brand))';

/**
 * Fluxo de gastos por dia (aprovado pela diretoria), no estilo do gráfico de área interativo:
 * curva do dia e a média dos últimos 7 dias, com o período escolhido no canto.
 * Clicar num dia abre o detalhe do que foi gasto nele.
 */
export function FlowChart({ sectorId, onDay }: { sectorId: string | null; onDay?: (date: string) => void }) {
  const user = useUser();
  const id = useId().replace(/:/g, '');
  const [range, setRange] = useState<Range>(90);
  // Busca 6 dias a mais para a média de 7 dias já começar certa no primeiro dia mostrado.
  const { data: raw = [] } = useQuery(() => api.spendingByDay(user, sectorId, 96), [sectorId]);

  const data = useMemo(() => {
    const withAvg = raw.map((d, i) => {
      const win = raw.slice(Math.max(0, i - 6), i + 1);
      return { date: d.date, dia: d.consumed / 100, media: Math.round(win.reduce((s, x) => s + x.consumed, 0) / 7) / 100 };
    });
    return withAvg.slice(-range);
  }, [raw, range]);
  const total = data.reduce((s, d) => s + d.dia, 0);
  const current = RANGES.find((r) => r.value === range)!;

  return (
    <section className="rounded-lg border bg-card" aria-label="Fluxo de gastos">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-5 sm:px-6">
        <div>
          <h2 className="text-base font-semibold">Fluxo de gastos</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {current.label}: <strong className="tabular font-semibold text-foreground">{money(Math.round(total * 100))}</strong> aprovados pela diretoria
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border shadow-soft" role="group" aria-label="Período">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={cx(
                'h-9 border-l px-3 text-[13px] font-medium transition-colors first:border-l-0 sm:px-4',
                range === r.value ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="hidden sm:inline">{r.label}</span>
              <span className="sm:hidden">{r.short}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="h-[260px] px-2 pb-3 pt-4 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, left: 12, bottom: 0 }}
            onClick={(e) => {
              const d = e?.activeLabel as string | undefined;
              if (d && onDay && data.find((x) => x.date === d)?.dia) onDay(d);
            }}
            className={onDay ? 'cursor-pointer' : undefined}
          >
            <defs>
              <linearGradient id={`${id}-dia`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BRAND} stopOpacity={0.55} />
                <stop offset="95%" stopColor={BRAND} stopOpacity={0.06} />
              </linearGradient>
              <linearGradient id={`${id}-media`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BRAND} stopOpacity={0.8} />
                <stop offset="95%" stopColor={BRAND} stopOpacity={0.12} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={32}
              tickFormatter={tick}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <Tooltip cursor={{ stroke: 'hsl(var(--border))' }} content={<FlowTooltip />} />
            <Area dataKey="dia" name="Gasto do dia" type="monotone" fill={`url(#${id}-dia)`} stroke={BRAND} strokeWidth={1.5} activeDot={{ r: 4 }} />
            <Area dataKey="media" name="Média de 7 dias" type="monotone" fill={`url(#${id}-media)`} stroke={BRAND} strokeWidth={1.5} strokeOpacity={0.9} activeDot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t px-5 py-3 text-[13px] text-muted-foreground sm:px-6">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand/45" />Gasto do dia</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand" />Média de 7 dias</span>
        {onDay && <span className="ml-auto hidden sm:inline">Clique num dia para ver as solicitações.</span>}
      </div>
    </section>
  );
}

function FlowTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[180px] rounded-md border bg-card px-3 py-2 text-[13px] shadow-pop">
      <div className="mb-1.5 font-medium">{long(label as string)}</div>
      {payload.map((p) => (
        <div key={p.dataKey as string} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className={cx('h-2 w-2 rounded-full', p.dataKey === 'dia' ? 'bg-brand/45' : 'bg-brand')} />
            {p.name}
          </span>
          <span className="tabular font-semibold">{money(Math.round((p.value ?? 0) * 100))}</span>
        </div>
      ))}
    </div>
  );
}
