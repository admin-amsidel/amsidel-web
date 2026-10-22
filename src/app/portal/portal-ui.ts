import { EnvironmentProviders, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { ConfirmationService, MessageService } from 'primeng/api';
import { PrimeNG } from 'primeng/config';

/**
 * PrimeNG in Amsidel colours: brushed gold (#B08A4E, from the logo) as the primary colour, warm greys for
 * surfaces and charcoal for text, pill-shaped buttons like the public website. Light mode only, as the site.
 */
export const AmsidelPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#faf6ef',
      100: '#f3ead9',
      200: '#e7d4b3',
      300: '#d8b676',
      400: '#c49f62',
      500: '#b08a4e',
      600: '#8f6d38',
      700: '#74582e',
      800: '#5c4626',
      900: '#4a3920',
      950: '#2a2012',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f8f6f2',
          100: '#f1eee8',
          200: '#e8e5e0',
          300: '#d6d1c9',
          400: '#b3ada4',
          500: '#8c867d',
          600: '#66625c',
          700: '#4b4843',
          800: '#2a2a2e',
          900: '#1e1e21',
          950: '#161618',
        },
        primary: {
          color: '{primary.500}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.600}',
          activeColor: '{primary.700}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.700}',
          focusColor: '{primary.800}',
        },
      },
    },
  },
  components: {
    button: { root: { borderRadius: '2rem' } },
  },
});

let configured = false;

/**
 * Route-level setup for the staff portal (login + /portal), so the public website never loads PrimeNG.
 * providePrimeNG() only applies at app start, so the theme is set when these routes are first opened.
 */
export function providePortalUi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    MessageService,
    ConfirmationService,
    provideEnvironmentInitializer(() => {
      if (configured) return;
      configured = true;
      inject(PrimeNG).setConfig({
        ripple: true,
        theme: { preset: AmsidelPreset, options: { darkModeSelector: false, cssLayer: false } },
      });
    }),
  ]);
}
