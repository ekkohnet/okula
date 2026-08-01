// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";
import prettier from "eslint-config-prettier";

export default withNuxt({
  ignores: ["bindings/"],
}).append(prettier);
