import { cva } from "class-variance-authority"

// Appearance only: every value resolves to a token in app/globals.css, and no component may
// add a colour, radius, shadow or type size of its own. Measured contrast is in DESIGN_SYSTEM.md.

// Labels, descriptions and invalid state live in components/ui/a11y.ts, so a change of
// appearance can never quietly drop an aria attribute.

// Type sizes are fluid tokens, so the mobile step is built into the scale instead of
// living in a breakpoint override.
export const heading = cva("font-display", {
  variants: {
    level: {
      page: "text-page font-bold",
      section: "text-section font-bold",
      panel: "text-panel font-semibold",
      sub: "text-sub font-semibold",
    },
    tone: {
      deep: "text-deep-current",
      ink: "text-ink",
      warning: "text-sediment-text",
      danger: "text-alarm-coral-text",
    },
  },
  defaultVariants: { level: "page", tone: "deep" },
})

// min-h-11 is 44px, the smallest touch target DESIGN.md allows. The compact size keeps
// that height and only loses horizontal padding, so a dense row never produces a
// target a thumb cannot hit.
export const button = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-crisp font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      tone: {
        primary: "bg-deep-current text-foam hover:opacity-90",
        secondary: "border border-muted bg-surface-white text-ink hover:bg-bg-deep",
        danger: "bg-alarm-coral-text text-white hover:opacity-90",
      },
      size: {
        md: "px-4",
        compact: "px-3 text-sm",
      },
    },
    defaultVariants: { tone: "primary", size: "md" },
  },
)

// The border is muted, not foam-line: an input edge is a control boundary and needs
// 3:1 against the panel, which foam-line (1.29:1) does not reach.
export const control = cva(
  "min-h-11 w-full rounded-crisp border border-muted bg-surface-white px-3 text-ink aria-[invalid=true]:border-alarm-coral-text",
  {
    variants: {
      font: {
        body: "",
        // Serial numbers, tokens and other values that are read character by character.
        data: "font-data",
      },
    },
    defaultVariants: { font: "body" },
  },
)

// Elevation marks one thing, so panels stay flat by default. The notice border is
// doubled rather than filled: a filled warning panel would need its own measured text
// pairing, and the border already separates it from the panels around it.
export const panel = cva("rounded-panel p-5 sm:p-6", {
  variants: {
    tone: {
      plain: "border border-foam-line bg-surface-white",
      notice: "border-2 border-sediment-text bg-surface-white",
    },
  },
  defaultVariants: { tone: "plain" },
})

// One place decides what a state looks like, so an alert severity and a command status
// that mean the same thing cannot drift apart. Colour never carries the meaning on its
// own; the component prints the state as a word next to it.
export const statusText = cva("font-semibold", {
  variants: {
    tone: {
      neutral: "text-ink",
      ok: "text-clear-water-text",
      warning: "text-sediment-text",
      danger: "text-alarm-coral-text",
      idle: "text-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
})

// The wordmark is also the link home, so it carries the 44px target height even though
// it is typographic rather than a button.
export const brandLink = `${heading({ level: "sub" })} inline-flex min-h-11 items-center`

// A link inside a running sentence. WCAG 2.2 SC 2.5.8 exempts targets constrained by
// the line height of the text around them, and forcing 44px here would break the line
// box. The vertical padding still enlarges the hit area, because padding on an inline
// box does not change the line height.
export const sentenceLink = "py-2 font-semibold text-deep-current underline underline-offset-4"

// A link that has to be reachable by thumb, used where a button would overstate the
// action. The height is the same 44px; only the paint differs.
export const inlineLink =
  "inline-flex min-h-11 items-center font-medium text-deep-current underline underline-offset-4"
