import { money, monthLabel, shiftMonth } from '@/domain/format';
import { holidaysOfMonth } from '@/domain/holidays';
import type { Month } from '@/domain/types';
import { Icon } from '@/components/ui/icons';
import { cx } from '@/components/ui/primitives';

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Calendário comum do mês: semana de domingo a sábado, hoje marcado, feriados nacionais em destaque
 * e, quando houver, um ponto nos dias com gastos aprovados (clicar abre o detalhe do dia).
 */
export function MonthCalendar({
  month,
  onMonth,
  spent,
  onDay,
  compact,
}: {
  month: Month;
  onMonth: (m: Month) => void;
  spent?: Map<string, number>;
  onDay?: (date: string) => void;
  compact?: boolean;
}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const hol = holidaysOfMonth(month);
  const holAt = new Map(hol.map((h) => [h.date, h]));
  const today = todayIso();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} className="grid h-8 w-8 place-items-center rounded-md hover:bg-foreground/[0.05]" aria-label="Mês anterior">
          <Icon name="chevronLeft" size={16} />
        </button>
        <span className="text-[15px] font-semibold">{monthLabel(month)}</span>
        <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} className="grid h-8 w-8 place-items-center rounded-md hover:bg-foreground/[0.05]" aria-label="Próximo mês">
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] text-muted-foreground" aria-hidden="true">
        {WEEK.map((w) => <div key={w} className="pb-2">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Calendário de ${monthLabel(month)}`}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const iso = `${month}-${pad(d)}`;
          const h = holAt.get(iso);
          const weekend = i % 7 === 0 || i % 7 === 6;
          const value = spent?.get(iso) ?? 0;
          const click = value > 0 && onDay ? () => onDay(iso) : undefined;
          const title = [h ? `${h.name}${h.optional ? ' (ponto facultativo)' : ''}` : '', value ? `Gastos: ${money(value)}` : ''].filter(Boolean).join(' · ');
          return (
            <button
              key={iso}
              type="button"
              disabled={!click}
              onClick={click}
              title={title || undefined}
              aria-label={`${d}${title ? `, ${title}` : ''}`}
              className={cx(
                'relative flex flex-col items-center justify-center rounded-md text-sm tabular disabled:cursor-default',
                compact ? 'h-9' : 'h-10',
                click && 'hover:bg-foreground/[0.06]',
                weekend && !h && 'text-muted-foreground',
                h && !h.optional && 'bg-danger-soft font-semibold text-danger',
                h?.optional && 'bg-warn-soft font-medium text-warn',
                iso === today && 'ring-2 ring-inset ring-primary',
              )}
            >
              {d}
              {value > 0 && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <ul className="mt-4 space-y-1.5 text-[13px]">
        {hol.map((h) => (
          <li key={h.date + h.name} className="flex items-center gap-2.5">
            <span className={cx('tabular w-11 shrink-0 rounded px-1.5 py-0.5 text-center text-[12px] font-semibold', h.optional ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger')}>
              {h.date.slice(8)}/{h.date.slice(5, 7)}
            </span>
            <span className="min-w-0 truncate">{h.name}</span>
            {h.optional && <span className="shrink-0 text-muted-foreground">ponto facultativo</span>}
          </li>
        ))}
        {!hol.length && <li className="text-muted-foreground">Nenhum feriado nacional neste mês.</li>}
      </ul>
      {spent && spent.size > 0 && (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" /> Dia com gasto aprovado. Clique para ver.
        </p>
      )}
    </div>
  );
}
