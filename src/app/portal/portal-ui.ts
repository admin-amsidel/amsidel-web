/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { EnvironmentProviders, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from '@angular/core';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { ConfirmationService, MessageService } from 'primeng/api';
import { PrimeNG } from 'primeng/config';

/**
 * PrimeNG in the staff portal's colours: blue shades on white (primary #2F80D6), cool blue-greys for surfaces and
 * dark grey / near-black for text, pill-shaped buttons. Light mode only. The public website keeps its gold.
 */
export const AmsidelPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eef6fe',
      100: '#d9eafc',
      200: '#b9d8f8',
      300: '#8cbff2',
      400: '#5aa0e8',
      500: '#2f80d6',
      600: '#2166b5',
      700: '#1c5292',
      800: '#1b4577',
      900: '#1a3a63',
      950: '#12253f',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f5f9fd',
          100: '#edf3f9',
          200: '#dfe8f1',
          300: '#c9d5e2',
          400: '#9aa9ba',
          500: '#6f7e90',
          600: '#536172',
          700: '#3e4a58',
          800: '#2b3440',
          900: '#1f2630',
          950: '#141a22',
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
