// Company details used across the site. Fill in the blanks before going live;
// empty values are hidden in the UI rather than shown as placeholders.
export const SITE = {
  company: 'Amsidel Enterprises Private Limited',
  shortName: 'Amsidel',
  brand: 'Amsidel Doors & Windows',
  website: 'www.amsidel.com',
  email: 'info@amsidel.com',
  // Inbox that receives website enquiries (sent via formsubmit.co, see quote-form.ts).
  // After FormSubmit is activated you can replace this with the random alias it gives
  // you, so the real address is not visible in the page source.
  enquiryEmail: 'info.amsidel@gmail.com',
  phone: '', // e.g. '+91 98765 43210'
  whatsapp: '', // digits only with country code, e.g. '919876543210'
  address: '', // showroom / office address
  hours: 'Mon – Sat · 9:30 AM – 6:30 PM',
  social: {
    facebook: '',
    instagram: '',
    youtube: '',
    linkedin: '',
  },
} as const;

export function telHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}

export function whatsappHref(text = ''): string {
  return `https://wa.me/${SITE.whatsapp}` + (text ? `?text=${encodeURIComponent(text)}` : '');
}
