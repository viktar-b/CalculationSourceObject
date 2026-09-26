# Verification

Use this workflow when a change crosses Python capture, core evaluation,
document preparation or export. [Development](../../docs/development.md) owns
setup and command definitions; [CI](../../.github/workflows/ci.yml) owns the
required hosted checks.

1. Record the branch, working tree and index state. Identify the changed packages
   and the checks that consume their built output. Done when the verification
   scope and user-owned changes are explicit.
2. For Python changes, rebuild and install the wheel using the development
   guide. Set `PYTHON` to that installed interpreter. Confirm its import with
   `"$PYTHON" -I -c 'import cso_python; print(cso_python.__file__)'`. Done when
   the command resolves inside the chosen environment rather than the source
   checkout or a different interpreter.
3. Run package tests through their npm workspace scripts. For example,
   `npm run test --workspace @cs-object/core` selects the package directory and
   runs its build prerequisite. Package Vitest configurations use relative test
   globs; selecting a config from another working directory can select another
   suite. Done when the reported suite belongs to the intended package.
4. Run dependent checks in sequence. Library builds clean and replace `dist/`;
   typechecks and consumers need the completed declarations. After focused
   checks, a full local pass can use
   `npm run lint && npm run typecheck && npm test` with `PYTHON` still selected.
   Use the development guide to add relevant isolation, archive or demo checks.
   Done when each required command has a recorded exit status.
5. Save long command output to a task-local log. Report command, status and
   evidence path; inspect the failure excerpt before expanding the whole log.
   A later successful command does not establish that an earlier command in
   the same shell invocation passed. Done when failures, warnings and unfinished
   checks are distinguishable from successful checks.

Parallelize independent source reads or tests that only read completed builds.
Keep build/install mutations ahead of their consumers. The session that produced
these workflows hit both wrong-directory test selection and missing declarations
while a concurrent build was replacing them; neither was a product regression.
