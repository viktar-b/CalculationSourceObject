# Authoring API cases

These are small synthetic language cases, not engineering examples.

- `defaulted_step`: one addition with a default; exports its result and inherited
  input so forwarding can be observed independently of numeric equality.
- `forwarded_output`: two calls joined by an exported input; distinguishes an
  output hop from a direct parameter hop and preserves invocation identities.
- `hidden_intermediate`: observes a non-exported assignment used by an output.
- `metadata`: shared aliases for exact-unit and identity tests.

Tests copy the needed sources to a temporary directory, create nested variants
there and generate bindings there. Single-letter glyphs intentionally exercise
legacy normalization and collision handling; these are not authoring examples.
