// PostCSS config so Next.js runs Tailwind (v3) + autoprefixer over globals.css.
// Without this file the `@tailwind` directives pass through unprocessed and no
// utility classes are generated (the page renders unstyled).
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
