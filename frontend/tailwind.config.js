/** @type {import('tailwindcss').Config} */
module.exports = {
    // Phones: hover styles don't stick after a tap (mouse/trackpad unchanged)
    future: { hoverOnlyWhenSupported: true },
    // Dark is the absence of .light on <html>, so dark: variants match that
    darkMode: ["variant", "&:not(.light *)"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			sans: ['Manrope', 'system-ui', 'sans-serif'],
  			mono: ['"Geist Mono"', 'ui-monospace', 'monospace']
  		},
  		// Calmer weights, like the landing page (headings are semibold there)
  		fontWeight: {
  			extrabold: '700',
  			black: '750'
  		},
  		colors: {
  			brand: {
  				DEFAULT: 'hsl(var(--brand))',
  				foreground: 'hsl(var(--brand-foreground))',
  				soft: 'hsl(var(--brand-soft))'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		transitionTimingFunction: {
  			// Expo-out: fast start, long soft landing. The house curve for motion.
  			out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  			spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  			snap: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
  		},
  		keyframes: {
  			// Windows (dialogs): rise out of a slightly smaller, softer self.
  			// No "to" frame, so the element's own centring transform is kept.
  			'dialog-in': {
  				from: { opacity: '0', transform: 'translate(-50%, calc(-50% + 22px)) scale(0.9)', filter: 'blur(6px)' }
  			},
  			'dialog-out': {
  				to: { opacity: '0', transform: 'translate(-50%, calc(-50% + 14px)) scale(0.94)', filter: 'blur(4px)' }
  			},
  			'overlay-in': { from: { opacity: '0', backdropFilter: 'blur(0px)' } },
  			'overlay-out': { to: { opacity: '0', backdropFilter: 'blur(0px)' } },
  			// Floating panels grow from the control that opened them (Radix sets the origin)
  			'pop-in': { from: { opacity: '0', transform: 'translateY(var(--pop-y, -6px)) scale(0.94)', filter: 'blur(2px)' } },
  			'pop-out': { to: { opacity: '0', transform: 'translateY(-2px) scale(0.97)' } },
  			'tip-in': { from: { opacity: '0', transform: 'translateY(var(--pop-y, -3px)) scale(0.92)' } },
  			// Content that replaces other content (tab panels, wizard steps)
  			'panel-in': { from: { opacity: '0', transform: 'translateY(8px)' } },
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'dialog-in': 'dialog-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both',
  			'dialog-out': 'dialog-out 200ms cubic-bezier(0.4, 0, 1, 1) both',
  			'overlay-in': 'overlay-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
  			'overlay-out': 'overlay-out 220ms ease-in both',
  			'pop-in': 'pop-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
  			'pop-out': 'pop-out 150ms ease-in both',
  			'tip-in': 'tip-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
  			'panel-in': 'panel-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};