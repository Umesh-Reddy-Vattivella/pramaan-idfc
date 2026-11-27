import { redirect } from 'next/navigation';

/** Old "Owner Self-Capture / Valuation Links" route → new case wizard. */
export default function CaptureRedirect() {
  redirect('/bank/new');
}
