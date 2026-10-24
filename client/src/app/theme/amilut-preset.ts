import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeNG theme: Aura retuned to the app's house style — a petrol-teal brand
 * scale for actions, focus and selection, cool blue-grey neutrals, hue
 * otherwise reserved for status severities, crisp radii. The CSS variables in
 * src/styles.scss (`--color-*`) carry the same values for the app's own
 * layout styles; keep the two in sync.
 */
export const AmilutPreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '2px',
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '10px',
    },
  },
  semantic: {
    primary: {
      50: '#e8f4f6',
      100: '#cfe8ec',
      200: '#a4d2da',
      300: '#71b5c1',
      400: '#4296a5',
      500: '#2a8393',
      600: '#226f7e',
      700: '#1d6474',
      800: '#174f5c',
      900: '#12333d',
      950: '#0b2229',
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.500}',
      offset: '2px',
    },
    formField: {
      paddingX: '0.625rem',
      paddingY: '0.4375rem',
      focusRing: {
        width: '3px',
        style: 'solid',
        color: 'rgb(42 131 147 / 0.24)',
        offset: '0',
        shadow: 'none',
      },
    },
    overlay: {
      select: { shadow: '0 12px 28px -8px rgb(15 33 43 / 0.2)' },
      popover: { shadow: '0 12px 28px -8px rgb(15 33 43 / 0.2)' },
      modal: {
        borderRadius: '{border.radius.lg}',
        shadow: '0 16px 36px -10px rgb(15 33 43 / 0.18), 0 2px 6px rgb(15 33 43 / 0.05)',
      },
      navigation: { shadow: '0 12px 28px -8px rgb(15 33 43 / 0.2)' },
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f7f9fa',
          100: '#edf1f4',
          200: '#dfe5ea',
          300: '#c9d2d9',
          400: '#94a1ac',
          500: '#586673',
          600: '#46535f',
          700: '#33404b',
          800: '#232e38',
          900: '#16212b',
          950: '#0c141b',
        },
        primary: {
          color: '{primary.700}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.800}',
          focusColor: '{primary.900}',
        },
        formField: {
          color: '{surface.900}',
          placeholderColor: '{surface.400}',
          borderColor: '{surface.200}',
          hoverBorderColor: '{surface.300}',
          focusBorderColor: '{primary.600}',
          shadow: 'none',
        },
        text: {
          color: '{surface.900}',
          hoverColor: '{surface.950}',
          mutedColor: '{surface.500}',
          hoverMutedColor: '{surface.600}',
        },
      },
    },
  },
  components: {
    button: {
      root: {
        paddingX: '0.875rem',
        paddingY: '0.375rem',
        sm: { fontSize: '0.8rem', paddingX: '0.625rem', paddingY: '0.25rem' },
        label: { fontWeight: '500' },
      },
    },
    datatable: {
      headerCell: { padding: '0.5rem 0.75rem' },
      bodyCell: { padding: '0.625rem 0.75rem' },
      colorScheme: {
        light: {
          headerCell: { background: '{primary.50}', color: '{primary.900}' },
          row: { hoverBackground: '{surface.100}' },
        },
      },
    },
    tag: {
      root: { fontSize: '0.75rem', fontWeight: '500', padding: '0.0625rem 0.5rem' },
    },
    dialog: {
      header: { padding: '1rem 1.25rem' },
      content: { padding: '0 1.25rem 1.25rem' },
      footer: { padding: '0 1.25rem 1.25rem' },
    },
  },
});
