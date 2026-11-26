import { useState, type FormEvent } from 'react';
import logo from '@/assets/logo-planilha.jpg';
import logoDark from '@/assets/logo-planilha-claro.png';
import { useSession } from '@/app/session';
import { Icon } from '@/components/ui/icons';
import { ThemeSwitch } from '@/components/ui/ThemeSwitch';
import { Button, Field, Input } from '@/components/ui/primitives';
import { api } from '@/services/api';
import { ScIllustration } from './login/ScIllustration';

/** Campo preenchido (cinza, sem borda) como na tela de entrada do Alto. */
const filled = 'h-11 border-transparent bg-muted shadow-none focus:bg-card';

function Logo({ className }: { className: string }) {
  return (
    <>
      <img src={logo} alt="AM Comercial" className={`${className} dark:hidden`} />
      <img src={logoDark} alt="AM Comercial" className={`${className} hidden dark:block`} />
    </>
  );
}

/** Tela de entrada no estilo do Alto: frase e ilustração à esquerda, cartão de entrar à direita. */
export default function Login() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* brilho neutro e suave no canto (sem degradê colorido) */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-56 h-[640px] w-[900px] rounded-full bg-white/80 blur-[110px] dark:bg-white/[0.04]" />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeSwitch />
      </div>
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.45fr_1fr] lg:px-10">
        <div className="hidden lg:block">
          <Logo className="h-12" />
          <h1 className="mt-8 text-[52px] font-semibold leading-[1.08] tracking-[-0.035em] xl:text-[56px]">
            <span className="block whitespace-nowrap">Cada compra aprovada.</span>
            <span className="block whitespace-nowrap text-brand">Cada real sob controle.</span>
          </h1>
          <div className="mt-14 pl-6">
            <ScIllustration />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[400px] lg:mr-0">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo className="h-11" />
          </div>
          <div className="rounded-xl border bg-card px-8 pb-8 pt-9 shadow-pop">{mode === 'login' ? <LoginForm onForgot={() => setMode('forgot')} /> : <ForgotForm onBack={() => setMode('login')} />}</div>
          <p className="mt-6 text-center text-[13px] text-muted-foreground">© {new Date().getFullYear()} AM Comercial</p>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="text-center text-[26px] font-semibold">Entrar</h2>
      <p className="mt-1 text-center text-[15px] text-muted-foreground">Bom te ver de novo.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field label="E-mail">
          <Input id="login-email" type="email" autoComplete="username" placeholder="voce@amcomercial.com.br" className={filled} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Senha">
          <div className="relative">
            <Input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" className={`${filled} pr-11`} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              title={show ? 'Ocultar senha' : 'Mostrar senha'}
            >
              <Icon name="eye" size={18} />
            </button>
          </div>
        </Field>
        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="h-11 w-full text-[15px]" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>
      <button type="button" onClick={onForgot} className="mx-auto mt-6 block text-sm text-muted-foreground hover:text-foreground">
        Esqueci a senha
      </button>
    </>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await api.requestPasswordReset(email).catch(() => undefined);
    setBusy(false);
    setSent(true);
  };
  return (
    <>
      <h2 className="text-center text-[26px] font-semibold">Esqueci a senha</h2>
      <p className="mt-1 text-center text-[15px] text-muted-foreground">O administrador recebe o aviso e cria uma senha temporária para você.</p>
      {sent ? (
        <p className="mt-8 rounded-md bg-ok-soft px-4 py-3 text-center text-sm text-ok" role="status">Se o e-mail estiver cadastrado, o administrador foi avisado.</p>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="E-mail">
            <Input id="forgot-email" type="email" autoComplete="username" placeholder="voce@amcomercial.com.br" className={filled} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" className="h-11 w-full text-[15px]" disabled={busy}>Avisar o administrador</Button>
        </form>
      )}
      <button type="button" onClick={onBack} className="mx-auto mt-6 block text-sm text-muted-foreground hover:text-foreground">
        Voltar para entrar
      </button>
    </>
  );
}
