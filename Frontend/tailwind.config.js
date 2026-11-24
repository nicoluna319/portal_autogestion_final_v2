/**
 * Configuración de Tailwind CSS conectada a los Design Tokens de 3 capas
 * definidos en src/styles/tokens.css y design-system/portal-autogestion/design-tokens.json.
 */
const hslVar = (name) => `hsl(var(${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        /* === Escalas de marca (Primitives con soporte de opacidad) === */
        navy: {
          50: hslVar("--navy-50"),
          100: hslVar("--navy-100"),
          200: hslVar("--navy-200"),
          300: hslVar("--navy-300"),
          400: hslVar("--navy-400"),
          500: hslVar("--navy-500"),
          600: hslVar("--navy-600"),
          700: hslVar("--navy-700"),
          800: hslVar("--navy-800"),
          900: hslVar("--navy-900"),
          950: hslVar("--navy-950"),
        },
        amber: {
          50: hslVar("--amber-50"),
          100: hslVar("--amber-100"),
          200: hslVar("--amber-200"),
          300: hslVar("--amber-300"),
          400: hslVar("--amber-400"),
          DEFAULT: hslVar("--amber-500"),
          500: hslVar("--amber-500"),
          600: hslVar("--amber-600"),
          700: hslVar("--amber-700"),
          800: hslVar("--amber-800"),
        },

        /* === Tokens semánticos oficiales === */
        canvas: hslVar("--color-canvas"),
        surface: {
          DEFAULT: hslVar("--color-surface"),
          subtle: hslVar("--color-surface-subtle"),
          tint: hslVar("--color-surface-tint"),
        },
        foreground: {
          DEFAULT: hslVar("--color-foreground"),
          heading: hslVar("--color-foreground-heading"),
        },
        muted: {
          DEFAULT: hslVar("--color-surface-subtle"),
          foreground: hslVar("--color-muted-foreground"),
        },
        border: {
          DEFAULT: hslVar("--color-border"),
          strong: hslVar("--color-border-strong"),
          brand: hslVar("--color-border-brand"),
        },
        ring: hslVar("--color-ring"),
        primary: {
          DEFAULT: hslVar("--color-primary"),
          hover: hslVar("--color-primary-hover"),
          active: hslVar("--color-primary-active"),
          foreground: hslVar("--color-primary-foreground"),
        },
        accent: {
          DEFAULT: hslVar("--color-accent"),
          hover: hslVar("--color-accent-hover"),
          foreground: hslVar("--color-accent-foreground"),
        },
        success: {
          DEFAULT: hslVar("--color-success"),
          hover: hslVar("--color-success-hover"),
          foreground: hslVar("--color-success-foreground"),
          bg: hslVar("--color-success-bg"),
          border: hslVar("--color-success-border"),
        },
        warning: {
          DEFAULT: hslVar("--color-warning"),
          foreground: hslVar("--color-warning-foreground"),
          bg: hslVar("--color-warning-bg"),
          border: hslVar("--color-warning-border"),
        },
        danger: {
          DEFAULT: hslVar("--color-danger"),
          hover: hslVar("--color-danger-hover"),
          foreground: hslVar("--color-danger-foreground"),
          bg: hslVar("--color-danger-bg"),
          border: hslVar("--color-danger-border"),
        },
        info: {
          DEFAULT: hslVar("--color-info"),
          foreground: hslVar("--color-info-foreground"),
          bg: hslVar("--color-info-bg"),
          border: hslVar("--color-info-border"),
        },

        /* === Alias retrocompatibles del portal === */
        ok: {
          DEFAULT: hslVar("--color-success"),
          dark: hslVar("--color-success-hover"),
          bg: hslVar("--color-success-bg"),
          border: hslVar("--color-success-border"),
        },
        err: {
          DEFAULT: hslVar("--color-danger"),
          dark: hslVar("--color-danger-hover"),
          bg: hslVar("--color-danger-bg"),
          border: hslVar("--color-danger-border"),
        },
        ink: {
          DEFAULT: hslVar("--color-foreground"),
          muted: hslVar("--color-muted-foreground"),
          soft: hslVar("--color-border"),
        },
        lienzo: hslVar("--color-canvas"),
      },
      borderRadius: {
        token: "var(--radius-lg)",
        card: "var(--card-radius)",
        control: "var(--input-radius)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
        brand: "var(--shadow-brand)",
        dialog: "var(--shadow-dialog)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: 0, transform: "translateY(16px)" }, "100%": { opacity: 1, transform: "none" } },
        "fade-in": { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        "scale-in": { "0%": { opacity: 0, transform: "scale(.94)" }, "100%": { opacity: 1, transform: "none" } },
        "slide-right": { "0%": { opacity: 0, transform: "translateX(-14px)" }, "100%": { opacity: 1, transform: "none" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-14px)" } },
        gradient: { "0%,100%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" } },
        shine: { "0%": { transform: "translateX(-120%)" }, "100%": { transform: "translateX(220%)" } },
        ring: { "0%": { boxShadow: "0 0 0 0 rgba(239,159,39,.55)" }, "100%": { boxShadow: "0 0 0 14px rgba(239,159,39,0)" } },
      },
      animation: {
        "fade-up": "fade-up .6s cubic-bezier(.2,.7,.2,1) both",
        "fade-in": "fade-in .5s ease both",
        "scale-in": "scale-in .35s cubic-bezier(.2,.7,.2,1) both",
        "slide-right": "slide-right .5s cubic-bezier(.2,.7,.2,1) both",
        float: "float 7s ease-in-out infinite",
        "float-slow": "float 11s ease-in-out infinite",
        gradient: "gradient 14s ease infinite",
        shine: "shine 3.2s ease-in-out infinite",
        ring: "ring 2.2s ease-out infinite",
      },
    },
  },
  plugins: [],
};
