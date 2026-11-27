import BankHeader from '@/components/bank/BankHeader';

export default function BankLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BankHeader />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </>
  );
}
