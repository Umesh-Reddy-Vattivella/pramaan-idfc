import Link from 'next/link';
import { Building2, ShieldCheck, Smartphone } from 'lucide-react';

/** Entry point: two separate interfaces — the bank / valuer portal and the customer portal. */
export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="bg-maroon text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-base font-bold tracking-wide">PRAMAAN</div>
            <div className="text-[11px] uppercase tracking-wider text-white/70">IDFC FIRST Bank · Loan Against Property — Digital Technical Valuation</div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold text-ink">Who is signing in?</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Identification → Measurement → Valuation, with the technical sanity checks a bank needs before it accepts a property as security.
        </p>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Link href="/bank" className="card group p-7 transition hover:-translate-y-0.5 hover:shadow-lg">
            <Building2 className="h-9 w-9 text-maroon" />
            <h2 className="mt-4 text-xl font-bold text-ink">Bank / Valuer portal</h2>
            <p className="mt-2 text-sm text-slate-600">
              Sales, credit and in-house valuers: open cases, collect documents, request site capture from the customer, review the Technical Sanity Report and sign the valuation.
            </p>
            <span className="mt-5 inline-block font-semibold text-maroon group-hover:underline">Open bank portal →</span>
          </Link>
          <Link href="/customer/login" className="card group p-7 transition hover:-translate-y-0.5 hover:shadow-lg">
            <Smartphone className="h-9 w-9 text-maroon" />
            <h2 className="mt-4 text-xl font-bold text-ink">Customer portal</h2>
            <p className="mt-2 text-sm text-slate-600">
              Borrowers (or anyone helping them): sign in with the OTP sent to your registered mobile, upload the documents the bank asked for, and take photos of the property.
            </p>
            <span className="mt-5 inline-block font-semibold text-maroon group-hover:underline">Customer sign in →</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
