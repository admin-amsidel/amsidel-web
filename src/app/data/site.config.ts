// Company details used across the site. Fill in the blanks before going live;
// empty values are hidden in the UI rather than shown as placeholders.
export const SITE = {
  company: 'Amsidel Enterprises Private Limited',
  shortName: 'Amsidel',
  brand: 'Amsidel Doors & Windows',
  website: 'www.amsidel.com',
  // shown as plain text only (no mailto link); email links and buttons use `altEmail`
  email: 'info@amsidel.com',
  // second address shown next to `email`, and the one every "email us" link opens
  altEmail: 'info.amsidel@gmail.com',
  // Website enquiries (quote, site visit, AMI chat) are mailed by amsidel-backend through Brevo; the inbox they go to
  // is set on the backend (ENQUIRY_TO), so it is not visible in the page source. See shared/enquiry.ts.
  phone: '+91 79072 31647', // company and support line (AMI chat uses it too)
  // WhatsApp Business number, digits only with country code. The WhatsApp button next to the AMI chat uses it.
  whatsapp: '917907231647',
  // Set to true once the WhatsApp Business account is live: also shows WhatsApp links on the
  // contact page and product pages.
  whatsappActive: false,
  address: '', // showroom / office address
  hours: 'Mon – Sat · 9:30 AM – 6:30 PM',
  // Free site-visit booking form (/doors-windows/site-visit). Add towns to `areas` as service expands.
  siteVisit: {
    areas: ['Kothamangalam'],
    slots: ['10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'],
    closedWeekdays: [0], // Sunday (0 = Sunday … 6 = Saturday)
    maxDaysAhead: 60,
    maxPersons: 10,
  },
  // Product brochure in public/brochure/; size is shown next to the download links.
  brochure: {
    url: 'brochure/Amsidel-Brochure.pdf',
    file: 'Amsidel-Brochure.pdf',
    cover: 'brochure/brochure-cover.webp',
    size: '8.7 MB',
    pages: 17,
  },
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
