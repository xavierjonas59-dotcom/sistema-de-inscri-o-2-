import { useTheme, type ThemePref } from '@/app/theme';
import { Icon, type IconName } from './icons';
import { cx } from './primitives';

const OPTIONS: { value: ThemePref; icon: IconName; label: string }[] = [
  { value: 'light', icon: 'sun', label: 'Tema claro' },
  { value: 'system', icon: 'monitor', label: 'Tema automático (segue o computador)' },
  { value: 'dark', icon: 'moon', label: 'Tema escuro' },
];

/** Controle segmentado de tema (claro / automático / escuro), como no Alto. */
export function ThemeSwitch({ className }: { className?: string }) {
  const [pref, setPref] = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema" className={cx('inline-flex gap-0.5 rounded-full border bg-track p-0.5', className)}>
      {OPTIONS.map((o) => {
        const on = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => setPref(o.value)}
            className={cx('grid h-8 w-8 place-items-center rounded-full transition-colors', on ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground')}
          >
            <Icon name={o.icon} size={16} />
          </button>
        );
      })}
    </div>
  );
}
