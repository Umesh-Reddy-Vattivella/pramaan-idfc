/* Redirects page loads without a session cookie to the right login. API routes verify the signature themselves. */
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/bank') && !pathname.startsWith('/bank/login') && !req.cookies.get('pramaan_bank')) {
    const u = req.nextUrl.clone();
    u.pathname = '/bank/login';
    u.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(u);
  }
  if (pathname.startsWith('/customer') && !pathname.startsWith('/customer/login') && !req.cookies.get('pramaan_customer')) {
    const u = req.nextUrl.clone();
    u.pathname = '/customer/login';
    u.search = '';
    return NextResponse.redirect(u);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/bank/:path*', '/customer/:path*'] };
