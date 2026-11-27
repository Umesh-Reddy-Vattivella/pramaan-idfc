import Link from 'next/link';
import { Building2, ChevronRight, Smartphone } from 'lucide-react';
import { Logo } from '@/components/ui';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-5 py-12">
      <Logo sub="Loan Against Property · technical valuation" />
      <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Identify. Measure. Value.</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        The bank opens the application with the documents already in the loan file. The customer only turns on location and answers one video call at the property. The bank sees the full
        valuation and every technical remark; the customer sees the status.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link href="/bank/login" className="card group flex items-start gap-4 p-6 transition hover:border-maroon/40 hover:shadow-md">
          <div className="rounded-xl bg-maroon/10 p-3 text-maroon">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between font-bold text-ink">
              Bank portal <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-maroon" />
            </div>
            <p className="mt-1 text-sm text-slate-600">Sales, credit and in-house valuers: documents, video inspection, measurement, market evidence, valuation and the report.</p>
          </div>
        </Link>
        <Link href="/customer/login" className="card group flex items-start gap-4 p-6 transition hover:border-maroon/40 hover:shadow-md">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between font-bold text-ink">
              Customer portal <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-maroon" />
            </div>
            <p className="mt-1 text-sm text-slate-600">For the borrower (or anyone helping them): track the status, upload a document if asked, and take the bank’s video call at the property.</p>
          </div>
        </Link>
      </div>
      <p className="mt-10 text-xs text-slate-400">Prototype for IDFC FIRST Bank FAME 6.0. No KYC is repeated — identity was verified during loan onboarding.</p>
    </main>
  );
}
