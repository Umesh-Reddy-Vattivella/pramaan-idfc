'use client';

/* Customer-portal strings (English / Hindi). Kept small and plain for older homeowners. */
import { useCallback, useEffect, useState } from 'react';

export type Lang = 'en' | 'hi';

const T = {
  bank: { en: 'IDFC FIRST Bank', hi: 'IDFC FIRST बैंक' },
  portal: { en: 'Property valuation', hi: 'संपत्ति मूल्यांकन' },
  signIn: { en: 'Sign in', hi: 'साइन इन करें' },
  signOut: { en: 'Sign out', hi: 'साइन आउट' },
  signInSub: { en: 'Sign in to share documents and photos of the property you offered for your loan.', hi: 'ऋण के लिए दी गई संपत्ति के दस्तावेज़ और फ़ोटो साझा करने के लिए साइन इन करें।' },
  ref: { en: 'Application reference', hi: 'आवेदन संदर्भ संख्या' },
  refHint: { en: 'e.g. LAP-26-123456 (in the SMS from the bank)', hi: 'जैसे LAP-26-123456 (बैंक के SMS में)' },
  findApp: { en: 'Continue', hi: 'आगे बढ़ें' },
  otpTab: { en: 'OTP on mobile', hi: 'मोबाइल पर OTP' },
  codeTab: { en: 'Access code', hi: 'एक्सेस कोड' },
  sendOtp: { en: 'Send OTP', hi: 'OTP भेजें' },
  otpSentTo: { en: 'OTP sent to', hi: 'OTP भेजा गया' },
  enterOtp: { en: 'Enter the 6-digit OTP', hi: '6 अंकों का OTP दर्ज करें' },
  verify: { en: 'Verify & sign in', hi: 'सत्यापित करें और साइन इन करें' },
  resend: { en: 'Resend OTP', hi: 'OTP फिर से भेजें' },
  codeHint: { en: 'The 6-character code from the bank’s SMS / WhatsApp', hi: 'बैंक के SMS / WhatsApp में 6 अक्षरों का कोड' },
  noKyc: { en: 'No KYC needed — it was completed when you applied.', hi: 'KYC की ज़रूरत नहीं — आवेदन के समय हो चुका है।' },
  hello: { en: 'Namaste', hi: 'नमस्ते' },
  yourProperty: { en: 'Your property', hi: 'आपकी संपत्ति' },
  todo: { en: 'What the bank needs from you', hi: 'बैंक को आपसे क्या चाहिए' },
  allDone: { en: 'Nothing pending from you right now. The bank will contact you if anything else is needed.', hi: 'अभी आपकी ओर से कुछ बाकी नहीं है। ज़रूरत होने पर बैंक संपर्क करेगा।' },
  withBank: { en: 'Already with the bank', hi: 'बैंक के पास पहले से' },
  upload: { en: 'Upload', hi: 'अपलोड करें' },
  takePhoto: { en: 'Take photo', hi: 'फ़ोटो लें' },
  addMore: { en: 'Add page', hi: 'पेज जोड़ें' },
  dontHave: { en: "I don't have this", hi: 'मेरे पास नहीं है' },
  undo: { en: 'Undo', hi: 'वापस लें' },
  required: { en: 'Required', hi: 'ज़रूरी' },
  received: { en: 'Received — bank is checking', hi: 'मिल गया — बैंक जाँच रहा है' },
  verified: { en: 'Verified by bank', hi: 'बैंक द्वारा सत्यापित' },
  askedAgain: { en: 'Bank asked again', hi: 'बैंक ने फिर से माँगा' },
  notAvail: { en: 'Marked not available', hi: 'उपलब्ध नहीं बताया' },
  sitePhotos: { en: 'Photos & room sizes at the property', hi: 'संपत्ति पर फ़ोटो और कमरों का माप' },
  sitePhotosSub: { en: 'About 10 minutes at the property. Anyone in the family can do it.', hi: 'संपत्ति पर लगभग 10 मिनट। परिवार का कोई भी सदस्य कर सकता है।' },
  start: { en: 'Start', hi: 'शुरू करें' },
  done: { en: 'Done', hi: 'पूरा हुआ' },
  progress: { en: 'Progress', hi: 'प्रगति' },
  stepDocs: { en: 'Documents', hi: 'दस्तावेज़' },
  stepSite: { en: 'Site photos', hi: 'साइट फ़ोटो' },
  stepReview: { en: 'Bank review', hi: 'बैंक जाँच' },
  stepValued: { en: 'Valuation', hi: 'मूल्यांकन' },
  help: { en: 'Need help? Call your relationship manager.', hi: 'मदद चाहिए? अपने रिलेशनशिप मैनेजर को कॉल करें।' },
  uploading: { en: 'Uploading…', hi: 'अपलोड हो रहा है…' },
  back: { en: 'Back', hi: 'पीछे' },
} as const;

export type TKey = keyof typeof T;
const KEY = 'pramaan.portal.lang';

export function usePortalLang() {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v === 'hi' || v === 'en') setLangState(v);
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  const t = useCallback((k: TKey) => T[k][lang], [lang]);
  return { lang, setLang, t };
}
