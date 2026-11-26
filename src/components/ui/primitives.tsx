import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ALERT, type Tone } from '@/domain/labels';
import type { AlertLevel } from '@/domain/types';
import { Icon, type IconName } from './icons';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-soft hover:bg-primary/90',
  secondary: 'bg-white text-foreground border shadow-soft hover:bg-[#FAFAFB]',
  ghost: 'text-primary hover:bg-primary/[0.06]',
  danger: 'bg-white text-[#C62828] border shadow-soft hover:bg-[#FDF3F3]',
  success: 'bg-[#1f6f3a] text-white hover:bg-[#1a5f31]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: IconName }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 rounded px-3 text-[13px]' : 'h-10 rounded-md px-4 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 15} />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-lg border bg-card', className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const toneText: Record<Tone, string> = {
  neutral: 'text-[#5F5F64] bg-[#F1F1F2]',
  info: 'text-[#282C8D] bg-[#ECEDF8]',
  good: 'text-[#17694F] bg-[#E3F4EC]',
  warning: 'text-[#8A5A00] bg-[#FBF1DC]',
  serious: 'text-[#9A4A14] bg-[#FBEDE2]',
  critical: 'text-[#C62828] bg-[#FCEBEB]',
};

/** Etiqueta de status em formato de pílula, com fundo suave. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cx('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-5', toneText[tone])}>{children}</span>;
}

const alertBar: Record<AlertLevel, string> = {
  ok: 'bg-brand',
  attention: 'bg-status-warning',
  critical: 'bg-status-serious',
  over: 'bg-status-critical',
};

/** Barra de uso do limite: consumido (sólido) + reservado (claro). */
export function BudgetBar({
  consumed,
  reserved,
  limit,
  alert,
  showLegend = false,
}: {
  consumed: number;
  reserved: number;
  limit: number;
  alert: AlertLevel;
  showLegend?: boolean;
}) {
  const base = Math.max(limit, consumed + reserved, 1);
  const a = (consumed / base) * 100;
  const p = (reserved / base) * 100;
  return (
    <div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#EDEDF0]" role="img" aria-label={`Uso do limite: ${ALERT[alert].label}`}>
        <div className={cx('absolute inset-y-0 left-0', alertBar[alert])} style={{ width: `${a}%` }} />
        <div className={cx('absolute inset-y-0 opacity-35', alertBar[alert])} style={{ left: `calc(${a}% + ${a > 0 ? 2 : 0}px)`, width: `${p}%` }} />
        <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${(0.8 * limit * 100) / base}%` }} title="80% do limite" />
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full', alertBar[alert])} />Consumido</span>
          <span className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full opacity-35', alertBar[alert])} />Reservado</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-foreground/40" />80% do limite</span>
        </div>
      )}
    </div>
  );
}

export function AlertBadge({ level }: { level: AlertLevel }) {
  return <Badge tone={ALERT[level].tone}>{ALERT[level].label}</Badge>;
}

/**
 * Linha de saldo no formato de razão contábil: Limite − Reservado − Consumido = Disponível.
 * Mostra a conta que gera o saldo; o disponível é o único número em destaque.
 */
export function Ledger({
  limit,
  reserved,
  consumed,
  available,
  limitNote,
  children,
}: {
  limit: number;
  reserved: number;
  consumed: number;
  available: number;
  limitNote?: ReactNode;
  children?: ReactNode;
}) {
  const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const term = (label: string, value: number, note?: ReactNode) => (
    <div className="min-w-0">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="tabular text-base font-semibold sm:text-lg">{fmt(value)}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
  const op = (sign: string) => <div className="hidden self-center pt-3 text-lg text-muted-foreground sm:block" aria-hidden="true">{sign}</div>;
  return (
    <section className="rounded-lg border bg-card px-6 py-5" aria-label="Saldo do setor">
      <div className="grid grid-cols-2 items-start gap-x-4 gap-y-3 sm:grid-cols-[auto_auto_auto_auto_auto_auto_1fr] sm:gap-x-5">
        {term('Limite do mês', limit, limitNote)}
        {op('−')}
        {term('Reservado', reserved, 'aguardando diretoria')}
        {op('−')}
        {term('Consumido', consumed, 'liberado pela diretoria')}
        {op('=')}
        <div className="col-span-2 border-t pt-3 sm:col-span-1 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div className="text-[13px] text-muted-foreground">Disponível</div>
          <div className={cx('tabular text-[30px] font-semibold leading-tight tracking-[-0.02em]', available < 0 ? 'text-[#a12626]' : 'text-brand')}>{fmt(available)}</div>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-foreground/80">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-[#a12626]">{error}</span>}
    </label>
  );
}

const inputBase =
  'rounded border bg-white px-3 text-sm shadow-soft placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none';

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputBase, 'h-10 w-full', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputBase, 'w-full py-2', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(inputBase, 'pr-7', !/\bh-\d/.test(p.className ?? '') && 'h-10', !/\bw-/.test(p.className ?? '') && 'w-full', p.className)} />
);

/** Filtro segmentado: trilho cinza com a opção escolhida em um chip branco (estilo Alto). */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md bg-[#EBEBED] p-1" role="tablist">
      {items.map((it) => {
        const on = value === it.value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.value)}
            className={cx(
              'inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-medium transition-colors',
              on ? 'bg-white text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {it.label}
            {it.count !== undefined && <span className={cx('tabular text-[13px]', on ? 'text-muted-foreground' : it.count > 0 ? 'text-primary' : 'text-muted-foreground/70')}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Table({ children, min = 640 }: { children: ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth: min }}>{children}</table>
    </div>
  );
}
export const Th = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <th className={cx('whitespace-nowrap border-b px-5 py-3 text-[13px] font-normal text-muted-foreground first:pl-5', right && 'text-right', className)}>
    {children}
  </th>
);
export const Td = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <td className={cx('border-b px-5 py-3.5 align-middle [tr:last-child>&]:border-b-0', right && 'text-right tabular whitespace-nowrap font-semibold', className)}>{children}</td>
);
