const title = process.env.PR_TITLE ?? '';
const scopedTitle = /^[^\s():]+\([^\s()]+\): \S(?:[^\r\n]*\S)?$/u;

if (title !== title.trim() || !scopedTitle.test(title)) {
  process.stderr.write(
    'PR title must match <type>(<scope>): <description>. See CONTRIBUTING.md.\n',
  );
  process.exitCode = 1;
} else {
  process.stdout.write('PR title matches the contribution format.\n');
}
