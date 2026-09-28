# Create a local calculation project

Use Node.js 24 or newer and Python 3.11 or newer. After the versioned npm and
Python dependencies are published:

```sh
npm create cs-object my-report
cd my-report
npm run dev
```

The initializer creates an owned project template, installs its exact CLI
dependency, prepares `.venv`, and installs Chromium. It preserves generated
files after setup failure; run `npm run setup` in the project to retry.
Existing destinations are never overwritten.

Use `--skip-install` to create files without installing dependencies.
The generated project contains a synthetic rectangle calculation, an editable
brief, reference storage, and agent-neutral authoring guidance. Its editable
React and TypeScript page uses Vite, Tailwind and the selected shadcn preset.
`npm run dev` starts that page and the CLI calculation and report API on localhost.
The initializer contains no calculation server implementation.

Package tests execute a real npm archive in a temporary consumer. Full runtime
acceptance belongs to the repository's installed integration checks.
