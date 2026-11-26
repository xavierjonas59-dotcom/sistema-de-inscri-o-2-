import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { navigate, useQuery, useUser } from '@/app/session';
import { money } from '@/domain/format';
import { SC_STATUS, scTotal } from '@/domain/sc';
import { api } from '@/services/api';
import { Icon, type IconName } from '@/components/ui/icons';
import { cx } from '@/components/ui/primitives';

export interface Screen {
  path: string;
  label: string;
  icon: IconName;
  group: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Busca no estilo do Alto: botão "Buscar" (ou Ctrl K) abre uma janela central com as telas do perfil
 * e, ao digitar, as SCs encontradas por número, fornecedor, item ou solicitante.
 */
export function CommandPalette({ screens }: { screens: Screen[] }) {
  const user = useUser();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-56 items-center gap-2 rounded-md bg-muted px-3 text-sm text-muted-foreground hover:text-foreground md:flex"
        aria-label="Buscar (Ctrl K)"
      >
        <Icon name="search" size={16} />
        <span className="flex-1 text-left">Buscar</span>
        <kbd className="rounded-full border bg-card px-2 font-sans text-[11px] leading-5">Ctrl K</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-foreground/[0.05] md:hidden" aria-label="Buscar">
        <Icon name="search" size={18} />
      </button>
      {open && createPortal(<Palette screens={screens} onClose={() => setOpen(false)} canSearch={user.role !== 'ADMIN'} />, document.body)}
    </>
  );
}

function Palette({ screens, onClose, canSearch }: { screens: Screen[]; onClose: () => void; canSearch: boolean }) {
  const user = useUser();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { data: all = [] } = useQuery(() => (canSearch ? api.listRequests(user) : Promise.resolve([])), [user.id]);
  useEffect(() => input.current?.focus(), []);

  const term = norm(q.trim());
  const items = useMemo(() => {
    const sc = term
      ? all
          .filter((r) => [r.number, r.supplierName, r.requesterName, ...r.items.map((i) => i.description)].some((t) => norm(t).includes(term)))
          .slice(0, 6)
          .map((r) => ({ key: r.id, kind: 'sc' as const, label: `${r.number}  ${r.supplierName}`, hint: `${SC_STATUS[r.status].label} · ${money(scTotal(r))}`, go: () => navigate(`/sc/ver?id=${r.id}`) }))
      : [];
    const sv = screens
      .filter((s) => !term || norm(s.label).includes(term) || norm(s.group).includes(term))
      .map((s) => ({ key: s.path, kind: 'tela' as const, label: s.label, hint: s.group, icon: s.icon, go: () => navigate(s.path) }));
    return [...sv, ...sc];
  }, [term, all, screens]);
  useEffect(() => setActive(0), [term]);

  const run = (i: number) => {
    const it = items[i];
    if (!it) return;
    onClose();
    it.go();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-card shadow-pop"
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Icon name="search" size={19} className="text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, items.length - 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
              if (e.key === 'Enter') run(active);
            }}
            placeholder={canSearch ? 'Ir para uma tela ou buscar SC…' : 'Ir para uma tela…'}
            aria-label="Ir para uma tela ou buscar solicitação"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded-full border px-2 font-sans text-[11px] leading-5 text-muted-foreground">Esc</kbd>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
          {items.map((it, i) => (
            <li key={`${it.kind}-${it.key}`} role="option" aria-selected={i === active}>
              {it.kind === 'sc' && (i === 0 || items[i - 1].kind !== 'sc') && <div className="px-3 pb-1 pt-3 text-[12px] text-muted-foreground">Solicitações</div>}
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => run(i)}
                className={cx('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[15px]', i === active && 'bg-foreground/[0.06]')}
              >
                <Icon name={it.kind === 'sc' ? 'file' : it.icon} size={18} className="shrink-0 text-foreground/70" />
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                <span className="shrink-0 text-[13px] text-muted-foreground">{it.hint}</span>
                {i === active && <span className="text-muted-foreground" aria-hidden="true">↵</span>}
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nada encontrado para “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
