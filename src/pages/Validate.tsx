import { useEffect, useState } from 'react';
import logo from '@/assets/logo-am-comercial.jpg';
import { dateTime, money } from '@/domain/format';
import { SC_STATUS } from '@/domain/sc';
import { api } from '@/services/api';
import type { ValidationResult } from '@/services/DataService';
import { Badge, Button, Input } from '@/components/ui/primitives';

/** Página pública aberta pelo QR code do PDF: confere se as assinaturas valem para o conteúdo atual. */
export default function Validate({ query }: { query: URLSearchParams }) {
  const [number, setNumber] = useState(query.get('sc') ?? '');
  const [result, setResult] = useState<ValidationResult | null | undefined>(undefined);
  const check = async (n = number) => setResult(n.trim() ? await api.validate(n) : undefined);
  useEffect(() => {
    if (query.get('sc')) check(query.get('sc')!);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-lg p-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <img src={logo} alt="AM Comercial" className="h-12 w-12 rounded-sm" />
        <div>
          <div className="font-semibold text-brand">AM Comercial</div>
          <div className="text-sm text-muted-foreground">Validação de Solicitação de Compras</div>
        </div>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <Input aria-label="Número da SC" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="SC-2026-0001" />
        <Button type="submit">Validar</Button>
      </form>
      {result === null && <p className="mt-4 rounded border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">Solicitação não encontrada.</p>}
      {result && (
        <div className="mt-4 rounded border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">{result.number}</span>
            <Badge tone={SC_STATUS[result.status].tone}>{SC_STATUS[result.status].label}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-2 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">Setor</dt><dd>{result.sectorName}</dd>
            <dt className="text-muted-foreground">Solicitante</dt><dd>{result.requesterName}</dd>
            <dt className="text-muted-foreground">Data</dt><dd>{result.date.split('-').reverse().join('/')}</dd>
            <dt className="text-muted-foreground">Total</dt><dd className="tabular">{money(result.total)}</dd>
          </dl>
          <ul className="divide-y border-t">
            {result.signatures.map((s) => (
              <li key={s.slot} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.slot}</span>
                  {s.valid ? <Badge tone="good">Válida</Badge> : <Badge tone="critical">Inválida: conteúdo alterado</Badge>}
                </div>
                <div className="text-muted-foreground">{s.name}, {s.cargo.toLowerCase()}. Assinado em {dateTime(s.signedAt)}, código {s.code}.</div>
              </li>
            ))}
            {!result.signatures.length && <li className="px-4 py-3 text-sm text-muted-foreground">Ainda sem assinaturas.</li>}
          </ul>
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Compare o código impresso abaixo de cada assinatura com o código mostrado aqui. Se a SC for alterada depois de assinada, a assinatura aparece como inválida.
      </p>
      <a href="#/" className="mt-4 inline-block text-sm text-primary underline">Entrar no sistema</a>
    </div>
  );
}
