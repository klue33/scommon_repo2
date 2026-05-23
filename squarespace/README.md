# Squarespace pin-animation drop-in

Adds the levitate-and-beacon animation from the rebuild to the
**existing** `southcommoncentre.ca/wayfinder` page, without touching
the underlying SVG or wayfinder JS. Two files; both are Squarespace
panel paste-ins.

## Install

### 1. CSS

Open the Squarespace site editor:

`Website` → `Utilities` → `Custom CSS`

Paste the entire contents of [`wayfinder-animation.css`](./wayfinder-animation.css)
at the end of whatever is already there. Save.

The CSS targets `.pin` and `.pin.is-active` — both already present
in your existing DOM (every tenant is rendered as
`<a class="pin pin--N-M" data-space="X" aria-label="…">`). It pulls
colours from your existing site-style HSL tokens (`--accent-hsl`,
`--black-hsl`) so it tracks whatever palette is set in Site Styles.

### 2. JS

`Settings` → `Advanced` → `Code Injection` → **Footer**

Paste the contents of [`wayfinder-animation.js`](./wayfinder-animation.js),
wrapped in a `<script>` tag, at the end:

```html
<script>
/* paste wayfinder-animation.js contents here */
</script>
```

Save. The shim:

- Adds `.is-active` to the clicked pin (and removes it from the
  previously active one) so the CSS animation triggers
- Hooks search results that carry `data-space` so picking from the
  search list also activates the matching map pin
- Mirrors any legacy active marker (`.pin--active`, `.pin.active`,
  `aria-current="true"`) into `.is-active`, so if your existing JS
  is doing its own selection bookkeeping, the animation still fires

## Behavior

- **Hover** any pin → orange drop-shadow glow
- **Click** a pin (or pick from search) → it lifts off the map in
  two expand/retract pulses with a stack of dark drop-shadows
  beneath (the "building walls"), settles ~24 px above the surface,
  then gently bobs up and down with a breathing halo. Pure CSS;
  no JS animation loop.
- **Click another pin** → previous one snaps back down, new one
  rises. Animation restarts from frame 0 each time.
- **Click empty map area** → the active pin clears (optional;
  comment out the last `if` block in the JS to make selection
  sticky).
- Respects `prefers-reduced-motion` — skips the animation entirely
  for users who've opted out.

## Rolling back

Just delete the CSS paste and the `<script>` block. Nothing else
in your site is touched.

## Tuning

All knobs live at the top of `wayfinder-animation.css`:

| What | Where | Notes |
|---|---|---|
| Resting height | `translate(0, -24px)` at `100%` of `scc-pin-rise` | The "altitude" the pin hovers at after rising |
| Peak height | `translate(0, -30px)` at `54%` and `50%` of beacon | Maximum lift during the second pulse + bob |
| Pin scale | `scale(1.22)` / `1.25` | How much bigger the active pin appears |
| Rise duration | `1.4s` (the `scc-pin-rise` animation) | Total time for the two-pulse rise |
| Beacon period | `2.4s` (the `scc-pin-beacon` animation) | How fast the perpetual bob breathes |
| Wall darkness | `--beacon-a/b/c/d` block | Four alpha tiers of `--black-hsl`. Drop to `0.5/0.4/0.3/0.15` for lighter walls. |
| Halo colour | `--beacon-soft` | Defaults to 55% accent. Set to `1` for a strong halo. |

## Limitations

- **Filter chains are heavy on weak GPUs.** 12 stacked drop-shadows
  on the active pin is OK on any modern phone/laptop but may
  stutter during the rise on older Android devices. If that's a
  problem at SCC's kiosks, trim the wall layers in the `54%` and
  `100%` keyframes from 10 to ~5.
- **The pin is an icon, not a building footprint.** The "rises
  like a building" effect reads as a tall icon with shadow rather
  than a 3D building (which would need the actual unit polygons
  to be inline-SVG elements, not pin overlays). Looks good on its
  own; just be aware it isn't the literal "Walmart-shaped tower
  rising out of the map" effect from the rebuild.
- **No search-rank sorting** — clicking a search result that
  has a `data-space` attribute matching a pin's `data-space` is
  what triggers the activation. If your search uses a different
  data attribute, edit line ~50 of the JS to match.
