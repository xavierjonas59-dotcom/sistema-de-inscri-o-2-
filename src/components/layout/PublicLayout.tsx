import React from 'react';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="w-full border-b bg-card px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Inscrições</h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-2xl">{children}</div>
      </main>

      <footer className="border-t bg-card px-4 py-4 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} — Todos os direitos reservados.
      </footer>
    </div>
  );
}
