import { SignIn } from '@clerk/clerk-react';
import { Logo } from '../components/Shell';

const clerkAppearance = {
  variables: { colorPrimary: '#5c0fd9', colorText: '#16121f', fontFamily: 'Inter, system-ui, sans-serif', borderRadius: '10px' },
  elements: { card: 'shadow-none border-0', rootBox: 'w-full', cardBox: 'shadow-none w-full' },
};

export function SignInPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-accent/90 blur-[2px]" />
        <div className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-brand-dark" />
        <div className="relative"><Logo light /></div>
        <div className="relative mt-auto max-w-lg">
          <p className="eyebrow mb-4 text-white/70">Leave, simplified</p>
          <h1 className="text-[4.5rem] leading-[0.95]">Hasta la vista,<br />see you soon.</h1>
          <p className="mt-6 max-w-md text-subtitle text-white/80">
            Apply in under a minute. Know exactly where your request is: with your manager, with your HOD, or approved.
          </p>
          <ul className="mt-8 grid grid-cols-3 gap-3 text-small">
            {['7 leave types', 'Manager → HOD flow', 'Full audit trail'].map((t) => (
              <li key={t} className="rounded-control bg-white/10 px-3 py-2.5 font-semibold backdrop-blur">{t}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="flex flex-col items-center justify-center gap-8 px-4 py-10">
        <div className="lg:hidden"><Logo /></div>
        <div className="w-full max-w-md">
          <h2 className="mb-1 text-center uppercase">Welcome back</h2>
          <p className="mb-6 text-center text-small text-muted">Sign in with your work Google account or email.</p>
          <SignIn routing="hash" appearance={clerkAppearance} />
        </div>
      </section>
    </div>
  );
}
