# Contributing

Issues and design discussion are welcome.

Pin the package versions you use. Supported `.cso.py` authoring and public APIs
follow their documented versioned contracts. Breaking changes require an
explicit version change and migration guidance; existing calculations must be
reverified after an upgrade.

## Bugs

Open a GitHub issue with the bug template. Include what you ran, what you
expected, what happened, and how to reproduce it.

## Design discussion

Use the design discussion template. Opening a discussion does not mean the
change will be implemented.

## Pull requests

Code PRs are reviewed case by case. Link an issue when one exists. Say what
changed and how you checked it. Expect requests to rebase or rewrite when a
change breaks an established contract or lacks evidence for affected behavior.

Use `<type>(<scope>): <description>` for PR titles, for example
`feat(demo): show original Python alongside calculation examples`. Choose the
type and scope to match the change, such as `fix(demo)` for a demo bug fix.

### Closing issues

Use a separate closing keyword for every issue the PR fully resolves. Put each
reference on its own line in the PR description:

```text
Closes #123
Closes #456
```

A comma-separated list after one keyword does not close every listed issue.
Use ordinary references for related issues that remain incomplete. See
[GitHub's issue-linking syntax](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue).

Before merging a PR targeting `main`, compare its intended closing list with
GitHub's recognized links in the Development sidebar or with
`gh pr view <number> --json closingIssuesReferences`.

For stacked PRs, keep the intended closing list for every PR. GitHub documents
automatic closure for PRs targeting the default branch; verify the result for
each issue after a grouped stack merge.

After the changes reach `main`, check the actual state of every intended issue
before reporting the work complete. If an issue's acceptance criteria are met
but it remains open, close it as completed and link the merged PR. Leave
incomplete issues open and record the remaining work.

## Local setup

Follow [docs/development.md](docs/development.md).

## Authoring calculations

Read [docs/authoring.md](docs/authoring.md) before changing `.cso.py` sources.

## License, conduct, and security

This repository is licensed under [Apache-2.0](LICENSE). Participation is
covered by the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities
through the [security policy](SECURITY.md), not a public issue.
