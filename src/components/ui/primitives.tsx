import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ALERT, type Tone } from '@/domain/labels';
import type { AlertLevel } from '@/domain/types';
import { Icon, type IconName } from './icons';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-white text-foreground border border-input hover:bg-muted',
  ghost: 'text-primary hover:bg-primary/5',
  danger: 'bg-white text-[#a12626] border border-[#e3b4b4] hover:bg-[#fbeeee]',
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
        'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
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
  return <section className={cx('rounded border bg-card', className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const toneText: Record<Tone, string> = {
  neutral: 'text-[#5b5f6b] bg-[#f0f1f4]',
  info: 'text-[#282C8D] bg-[#eceefa]',
  good: 'text-[#1f6f3a] bg-[#e9f4ec]',
  warning: 'text-[#8a5a00] bg-[#fbf3e1]',
  serious: 'text-[#9a4a14] bg-[#fbefe6]',
  critical: 'text-[#a12626] bg-[#fbeeee]',
};

/** Etiqueta de status pequena e discreta. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cx('inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4', toneText[tone])}>{children}</span>;
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
      <div className="relative h-2 w-full overflow-hidden rounded-sm bg-muted" role="img" aria-label={`Uso do limite: ${ALERT[alert].label}`}>
        <div className={cx('absolute inset-y-0 left-0', alertBar[alert])} style={{ width: `${a}%` }} />
        <div className={cx('absolute inset-y-0 opacity-35', alertBar[alert])} style={{ left: `calc(${a}% + ${a > 0 ? 2 : 0}px)`, width: `${p}%` }} />
        <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${(0.8 * limit * 100) / base}%` }} title="80% do limite" />
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-3 rounded-sm', alertBar[alert])} />Consumido</span>
          <span className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-3 rounded-sm opacity-35', alertBar[alert])} />Reservado</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-foreground/40" />80% do limite</span>
        </div>
      )}
    </div>
  );
}

export function AlertBadge({ level }: { level: AlertLevel }) {
  return <Badge tone={ALERT[level].tone}>{ALERT[level].label}</Badge>;
}

/** Número de resumo, sem ícone decorativo. */
export function StatCard({ label, value, hint, emphasis }: { label: string; value: ReactNode; hint?: ReactNode; emphasis?: Tone }) {
  return (
    <div className="rounded border bg-card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cx('tabular mt-1 text-xl font-semibold', emphasis === 'critical' && 'text-[#a12626]', emphasis === 'warning' && 'text-[#8a5a00]')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-[#a12626]">{error}</span>}
    </label>
  );
}

const inputBase =
  'rounded border border-input bg-white px-2.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:bg-muted disabled:text-muted-foreground';

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputBase, 'h-9 w-full', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputBase, 'w-full py-2', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(inputBase, 'pr-7', !/\bh-\d/.test(p.className ?? '') && 'h-9', !/\bw-/.test(p.className ?? '') && 'w-full', p.className)} />
);

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-4 border-b" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            '-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium',
            value === it.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="tabular ml-1.5 text-xs text-muted-foreground">({it.count})</span>}
        </button>
      ))}
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
  <th className={cx('whitespace-nowrap border-b bg-muted/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', right && 'text-right', className)}>
    {children}
  </th>
);
export const Td = ({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <td className={cx('border-b px-3 py-2 align-top', right && 'text-right tabular whitespace-nowrap', className)}>{children}</td>
);
