# Fonts

The wires specify **Motiva Sans** (the Staples brand face) at weights 300 / 500 / 600 / 700.
The handoff prototype's `@font-face` rules point at font files that were **not shipped in the
bundle**, so the prototype itself renders with the `system-ui` fallback — and so does this POC.

To use the real face, drop the licensed WOFF2 files here:

```
public/fonts/MotivaSans-Light.woff2    (300)
public/fonts/MotivaSans-Regular.woff2  (400)
public/fonts/MotivaSans-Medium.woff2   (500)
public/fonts/MotivaSans-Bold.woff2     (700)
```

and add the matching `@font-face` declarations to `src/app/globals.css`:

```css
@font-face {
  font-family: "Motiva Sans";
  src: url("/fonts/MotivaSans-Light.woff2") format("woff2");
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
/* …repeat for 400 / 500 / 700 */
```

The font stack (`--font-sans` in `globals.css`) already lists "Motiva Sans" first, so the
files pick up with no other changes. Confirm license coverage before deploying with them.
