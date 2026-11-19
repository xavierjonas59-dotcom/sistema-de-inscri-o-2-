import { useState, type FormEvent } from 'react';
import logo from '@/assets/logo-am-comercial.jpg';
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
        <div className="flex items-center gap-3">
          <img src={logo} alt="AM Comercial" className="h-14 w-14 rounded-sm" />
          <div>
            <div className="text-lg font-semibold text-brand">AM Comercial</div>
            <div className="text-sm text-muted-foreground">Gestão de Despesas</div>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-3 rounded border bg-white p-5">
          <Field label="E-mail">
            <Input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Senha">
            <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="rounded bg-[#fbeeee] px-3 py-2 text-sm text-[#a12626]">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
        </form>

        <div className="mt-5 rounded border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usuários de demonstração</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Senha de todos: <code className="rounded-sm bg-muted px-1">{DEMO_PASSWORD}</code> (também usada para assinar)</p>
          <div className="mt-2 divide-y rounded border">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                onClick={() => submit(undefined, { email: u.email, password: DEMO_PASSWORD })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
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
