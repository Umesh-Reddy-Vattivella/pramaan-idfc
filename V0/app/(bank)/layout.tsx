import TopNav from '@/components/TopNav';

/** Bank / valuer portal shell — never shown to customers. */
export default function BankLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-6">{children}</main>
    </>
  );
}
