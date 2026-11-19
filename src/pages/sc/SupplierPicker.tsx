import { useRef, useState } from 'react';
import { useUser } from '@/app/session';
import type { Supplier } from '@/domain/types';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/overlay';
import { Input } from '@/components/ui/primitives';
import { errMsg, useLookups } from '../shared/lookups';

/** Busca no cadastro de fornecedores, com opção de cadastrar um novo na hora. */
export function SupplierPicker({ value, onSelect }: { value: string; onSelect: (s: Supplier) => void }) {
  const user = useUser();
  const toast = useToast();
  const { suppliers } = useLookups();
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number>();
  const term = q.trim().toLowerCase();
  const matches = suppliers.filter((s) => !term || s.name.toLowerCase().includes(term) || s.code.includes(term)).slice(0, 8);
  const exact = suppliers.some((s) => s.name.toLowerCase() === term);

  const pick = (s: Supplier) => {
    setQ(s.name);
    setOpen(false);
    onSelect(s);
  };

  return (
    <div className="relative">
      <Input
        id="sc-supplier"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        value={q}
        placeholder="Buscar por nome ou código"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => (blurTimer.current = window.setTimeout(() => setOpen(false), 150))}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white text-sm shadow-md" onMouseDown={() => clearTimeout(blurTimer.current)}>
          {matches.map((s) => (
            <li key={s.id}>
              <button type="button" className="flex w-full justify-between gap-3 px-3 py-2 text-left hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                <span>{s.name}</span>
                <span className="tabular text-xs text-muted-foreground">{s.code}</span>
              </button>
            </li>
          ))}
          {term && !exact && (
            <li>
              <button
                type="button"
                className="w-full border-t px-3 py-2 text-left text-primary hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  try {
                    pick(await api.saveSupplier(user, { name: q.trim() }));
                    toast('success', 'Fornecedor cadastrado.');
                  } catch (err) {
                    toast('error', errMsg(err));
                  }
                }}
              >
                Cadastrar novo fornecedor “{q.trim()}”
              </button>
            </li>
          )}
          {!matches.length && !term && <li className="px-3 py-2 text-muted-foreground">Nenhum fornecedor cadastrado.</li>}
        </ul>
      )}
    </div>
  );
}
