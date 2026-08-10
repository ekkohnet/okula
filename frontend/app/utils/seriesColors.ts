// Categorical series colors, assigned by slot order; consumers wrap
// past slot 10. Slots 1-5 are the original metrics-cycle palette,
// unchanged; 6-10 extend it for multi-source log prefixes (piece 6e).
// The full 10 passed the adjacent-pair gate (wrap pair included)
// against the sunken dark surface: OKLab CVD dE*100 >= 8.4 (the
// baseline's own worst pair), normal-vision >= 17.3, WCAG contrast
// >= 4.56:1. Ten is the ceiling for mutually distinguishable text
// colors on this surface — an 11th hue lands closer to a neighbor
// than the family's own floor, so honest wrapping beats near-twins.
export const SERIES_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // green
  "#c98500", // amber
  "#d55181", // rose
  "#7e6ade", // violet
  "#1db2c0", // cyan
  "#b650af", // magenta
  "#96ae30", // lime
  "#6bc3f4", // sky
];
