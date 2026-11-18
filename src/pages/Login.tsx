import { useState, type FormEvent } from 'react';
import { useSession } from '@/app/session';
import { Button, Field, Input } from '@/components/ui/primitives';
import { DEMO_PASSWORD, DEMO_USERS } from '@/services/seed';

export default function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(creds?.email ?? email, creds?.password ?? password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-sidebar p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary font-bold">MK</div>
          <span className="text-lg font-semibold">MKSAL</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Controle de despesas e orçamentos por setor</h1>
          <p className="mt-4 text-sidebar-foreground">
            Tetos mensais, solicitações com aprovação da Diretoria e transferência temporária de limite entre setores com
            dupla aprovação — tudo em tempo real.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-sidebar-foreground">
            <li>✓ Isolamento total de dados entre setores</li>
            <li>✓ Alertas automáticos a partir de 80% do teto</li>
            <li>✓ Relatórios exportáveis para Excel e PDF</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/60">© {new Date().getFullYear()} MKSAL</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use seu e-mail corporativo.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="E-mail">
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Senha">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-10 rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acesso de demonstração</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Senha de todos: <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code>
            </p>
            <div className="mt-3 grid gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  onClick={() => submit(undefined, { email: u.email, password: DEMO_PASSWORD })}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5"
                >
                  <span className="font-medium">{u.label}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
