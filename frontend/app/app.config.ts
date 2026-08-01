export default defineAppConfig({
  ui: {
    colors: {
      primary: "blue",
      neutral: "gray",
    },
    navigationMenu: {
      variants: {
        disabled: {
          true: {
            // Keep the regular cursor on disabled items; the default
            // cursor-not-allowed is jarring for idle-state nav.
            link: "cursor-default opacity-60",
          },
        },
      },
    },
    select: {
      slots: {
        // As above: regular cursor when disabled.
        base: "disabled:cursor-default",
      },
    },
  },
});
