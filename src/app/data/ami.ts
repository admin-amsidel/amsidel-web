// Content for AMI, the chat assistant on the Doors & Windows pages (see shared/ami-chat).
// Everything AMI says lives here so it can be reworded without touching the chat logic.
// Product types and designs come from products.ts, so new products appear in the chat automatically.
import { SITE } from './site.config';

export interface AmiFaq {
  /** Shown as a quick-reply button under "Common questions". */
  q: string;
  /** Lower-case words or phrases; a typed message that contains any of them gets this answer. */
  keywords: string[];
  a: string;
}

export const AMI = {
  name: 'AMI',
  role: 'Amsidel assistant',
  /** Optional photo/illustration in public/, e.g. 'brand/ami-avatar.webp'. Empty shows the built-in support-agent (headset) icon. */
  avatar: '',
  /** Small bubble next to the chat button, shown once a few seconds after the page opens. */
  teaser: "Hi, I'm AMI! Need help choosing doors or windows?",
  /** Support team number, shown in the chat header and as a tap-to-call link in support replies. Same as the company line. */
  supportPhone: SITE.phone as string,
  /** Label of the quick reply that hands the visitor to the support team; always listed first. */
  supportChoice: 'Talk to our support team',

  greeting: "Hi there! I'm AMI from Amsidel Doors & Windows. I'm here to help you find the right doors and windows for your space.",
  askName: 'Before we begin, may I know your name?',
  nameRetry: 'Sorry, I didn\'t catch that. Could you type just your name?',
  askPhone: (name: string) =>
    `Lovely to meet you, ${name}! Would you like to share your mobile number so our team can reach you? You can skip this for now.`,
  phoneSkipped: "No problem! You can chat freely. I'll only need your number if you'd like our support team to get back to you.",
  /** Asked when the visitor wants the support team but skipped the number earlier; the number is required here. */
  phoneNeeded: 'To connect you with our support team, I need your mobile number so they can call you back. Please type it below.',
  phoneRetry:
    "Hmm, that number doesn't look right. Please enter a 10-digit mobile number, or include the country code for numbers outside India (e.g. +971 50 123 4567).",
  phoneThanks: 'Thank you! Got your number.',
  welcome: (name: string) =>
    `${name}, welcome to Amsidel Doors & Windows. We make made-to-measure uPVC, aluminium, WPC and steel doors and windows, plus a full range of designer doors, supplied and installed.`,
  askType: 'Which product type are you looking for? You can also type a product code if you have one.',
  askDesign: 'Pick a design below, or type a product code (for example AU-101).',
  askCode: 'Sure, type the product code. You will find it under each design on our website and in the brochure (for example AU-101 or AW-105).',
  codeNotFound: (code: string) =>
    `I couldn't find "${code}". Our codes look like AU-101 or AW-105. Please check the code, or pick a product type instead.`,
  askBrochure: 'Would you like a copy of our product brochure? It has every range with model codes.',
  brochureReply: 'Here you go! Download it or view it online:',
  askSupport: 'Do you have any question you would like our support team to check for you?',
  askQuery: 'Of course! Type your question below. Sizes, number of doors/windows, pricing, installation, anything at all.',
  confirmQuery: 'Thanks! This is what I will share with our support team:',
  sent: (phone: string) => `Done! Our support team has your details and will get back to you on ${phone} shortly.`,
  sendFailed: "Sorry, I couldn't send that just now. Please try again, or call or email us directly:",  noQuery: (name: string) => `No problem, ${name}! Feel free to keep browsing. I'm right here if you need anything.`,
  notUnderstood: "I'm not sure I have the answer to that one. Shall I pass your question to our support team?",
  faqIntro: 'Here are some questions customers often ask:',
  anythingElse: 'Anything else I can help you with?',

  faqs: [
    {
      q: 'How much do doors and windows cost?',
      keywords: ['price', 'prices', 'cost', 'rate', 'rates', 'how much', 'budget', 'quote', 'quotation', 'estimate'],
      a: 'Prices depend on the material, size, glass and hardware you choose, since everything is made to measure. Share your sizes or the number of openings with our support team and we will send you a quote.',
    },
    {
      q: 'Do you visit the site and take measurements?',
      keywords: ['site visit', 'measure', 'measurement', 'measurements', 'visit', 'inspection'],
      a: `Yes! We offer a free site visit and measurement, currently in ${SITE.siteVisit.areas.join(', ')}. You can pick a date and time on our site-visit page.`,
    },
    {
      q: 'Do you install the doors and windows?',
      keywords: ['install', 'installation', 'installing', 'fitting', 'fitter'],
      a: 'Yes, we supply and install doors and windows for homes, apartments and commercial spaces.',
    },
    {
      q: 'Which doors are best for bathrooms?',
      keywords: ['bathroom', 'bathrooms', 'toilet', 'wet area', 'waterproof', 'water proof', 'washroom'],
      a: 'For bathrooms we recommend WPC, Fibre (FRP) or ABS doors. They are waterproof and will not swell, rot or attract termites.',
    },
    {
      q: 'Which windows keep out noise and dust?',
      keywords: ['noise', 'noisy', 'sound', 'dust', 'traffic', 'soundproof', 'quiet'],
      a: 'uPVC windows with double glazing are the best choice. Multi-chamber profiles and EPDM gaskets keep out dust, rain and street noise.',
    },
    {
      q: 'Which main door is the most secure?',
      keywords: ['secure', 'security', 'theft', 'burglar', 'main door', 'front door', 'entrance'],
      a: 'Our galvanised Steel doors with multi-point locks are the strongest option for main entrances. Add a Safety door in front for extra protection with air and light.',
    },
    {
      q: 'What are your working hours?',
      keywords: ['hours', 'timing', 'timings', 'working hours', 'open today', 'opening time', 'what time', 'sunday'],
      a: `Our hours are ${SITE.hours}.`,
    },
  ] satisfies AmiFaq[],
};
