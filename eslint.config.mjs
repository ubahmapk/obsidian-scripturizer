// ESLint flat config tuned for Obsidian plugin development.
// Requires: eslint, typescript-eslint, eslint-plugin-security, eslint-plugin-no-unsanitized
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";

export default tseslint.config(
	{ ignores: ["main.js", "node_modules/**", "dist/**"] },
	...tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				project: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: { security, "no-unsanitized": noUnsanitized },
		rules: {
			// Security: catch the exact XSS/injection footguns Obsidian's guidelines call out.
			"no-unsanitized/method": "error",
			"no-unsanitized/property": "error",
			"security/detect-eval-with-expression": "error",
			"security/detect-non-literal-fs-filename": "warn",
			"security/detect-unsafe-regex": "error",
			"security/detect-object-injection": "warn",

			// Obsidian plugin guideline enforcement
			"no-console": ["warn", { allow: ["error", "warn"] }],
			"no-restricted-globals": [
				"error",
				{ name: "app", message: "Use `this.app` instead of the global `app`." },
			],
			"no-restricted-properties": [
				"error",
				{ property: "innerHTML", message: "Use createEl()/createDiv()/createSpan() instead of innerHTML." },
				{ property: "outerHTML", message: "Use createEl()/createDiv()/createSpan() instead of outerHTML." },
				{ property: "insertAdjacentHTML", message: "Use createEl()/createDiv()/createSpan() instead of insertAdjacentHTML." },
			],

			"@typescript-eslint/no-unused-vars": "warn",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-non-null-assertion": "warn",
			"prefer-const": "error",
			"no-var": "error",
		},
	},
	// Root-level config/build scripts (esbuild, eslint, jest, version-bump) are plain JS
	// and are not part of the tsconfig project — drop type-aware linting for them so
	// `project: true` doesn't fail to resolve them.
	{
		files: ["**/*.mjs"],
		...tseslint.configs.disableTypeChecked,
	},
);
