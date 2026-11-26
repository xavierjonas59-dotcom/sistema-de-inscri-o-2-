import { useState, type FormEvent } from 'react';
import logo from '@/assets/logo-planilha.jpg';
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <img src={logo} alt="AM Comercial" className="mx-auto h-11" />
        <h1 className="mt-8 text-center text-[30px] font-semibold leading-tight tracking-[-0.02em]">Gestão de Despesas</h1>
        <p className="mt-1.5 text-center text-[15px] text-muted-foreground">Entre com o seu e-mail da AM Comercial.</p>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-lg border bg-card p-6 shadow-soft">
          <Field label="E-mail">
            <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Senha">
            <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="rounded bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
        </form>

        <div className="mt-5 rounded-lg border bg-card p-5 shadow-soft">
          <h2 className="text-sm font-semibold">Usuários de demonstração</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Senha de todos: <code className="rounded bg-muted px-1.5 font-sans font-medium text-foreground">{DEMO_PASSWORD}</code> (também usada para assinar)</p>
          <div className="mt-3 divide-y overflow-hidden rounded-md border">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                onClick={() => submit(undefined, { email: u.email, password: DEMO_PASSWORD })}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-background"
              >
                <span className="font-medium">{u.label}</span>
                <span className="text-xs text-primary">Entrar</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
