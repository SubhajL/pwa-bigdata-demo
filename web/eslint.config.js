import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  // `configs["recommended-latest"]` is still the LEGACY shape in v7 (plugins as an array
  // of strings) and eslint 9 rejects it outright. The flat namespace is the one to use.
  reactHooks.configs.flat.recommended,
  {
    rules: {
      // Standard escape hatch for deliberately-unused bindings: a parameter that exists
      // only to give a later one its position, or to type a mock's call signature.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // The token contract, enforced at lint time as well as by tokens.test.ts — a
      // developer sees this one in the editor, before the suite runs.
      //
      // `tokens.map.md`: "Raw hex in src/ is a build failure. Every colour resolves
      // through a token." The same reasoning covers durations and shadows, which Stitch
      // also emits as literals.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\\b/]",
          message:
            "Raw hex colour. Use a token from design/tokens.map.md (e.g. bg-primary, text-on-surface).",
        },
        {
          selector: "Literal[value=/\\b\\d+m?s\\b/]",
          message:
            "Raw duration. Use var(--anim-fast|--anim-medium|--anim-slow) from globals.css.",
        },
        {
          selector: "Property[key.name='boxShadow']",
          message: "Inline box-shadow. Use the shadow-card / shadow-popover token.",
        },
      ],
    },
  },
  {
    // Test files legitimately name durations and sample values while asserting that
    // production code does not.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
);
