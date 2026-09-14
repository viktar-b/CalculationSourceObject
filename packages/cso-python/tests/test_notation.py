"""Conformance checks for the standalone Python notation implementation."""

import unittest

from cso_python.glyphs import glyph_identity
from cso_python.notation import (
    DEPTH_LIMIT,
    NODE_LIMIT,
    SOURCE_LIMIT,
    NotationFraction,
    NotationGroup,
    NotationIdentifier,
    NotationOperator,
    NotationSubsup,
    NotationText,
    parse_notation,
)


class NotationTest(unittest.TestCase):
    def identity(self, source: str) -> str:
        parsed = parse_notation(source)
        self.assertTrue(parsed.ok, parsed)
        return glyph_identity(source)

    def diagnostic(self, source: str):
        parsed = parse_notation(source)
        self.assertFalse(parsed.ok, parsed)
        return parsed.diagnostic

    def test_aliases_use_complete_words_and_longest_punctuation_tokens(self):
        for left, right in (
            ("times", "xx"),
            ("emptyset", "O/"),
            ("alpha", r"\alpha"),
            ("alpha", "α"),
            (r"\\", "backslash"),
        ):
            with self.subTest(left=left, right=right):
                self.assertEqual(self.identity(left), self.identity(right))

        parsed = parse_notation(r"a /_\ b // c ^^ d")
        self.assertTrue(parsed.ok, parsed)
        operators = [node.value for node in parsed.value if isinstance(node, NotationOperator)]
        self.assertEqual(operators, ["△", "/", "∧"])

        for source, split_alias in (
            ("ooops", "oo ps"),
            ("oxygen", "ox ygen"),
            ("xxValue", "xx Value"),
            ("!index", "notin dex"),
        ):
            with self.subTest(source=source):
                self.assertNotEqual(self.identity(source), self.identity(split_alias))

    def test_identity_tracks_display_structure_and_effective_style(self):
        for left, right in (
            ("A_rect", "A_{rect}"),
            ('A_{rect}', 'A_{"rect"}'),
            ("{a {b c}}", "{a b c}"),
            ("𝛼", "α"),
            ("x", "𝑥"),
            ("h", "ℎ"),
            ("β", "𝛽"),
            ("ϑ", "𝜗"),
        ):
            with self.subTest(left=left, right=right):
                self.assertEqual(self.identity(left), self.identity(right))

        for left, right in (
            ('x', '"x"'),
            ('"𝛼"', '"α"'),
            ('"𝑥"', '"x"'),
            ("x", "𝐱"),
            ("ℝ", "R"),
            ("Θ", "𝛳"),
            ("θ", "𝜗"),
            ("(x)", "x"),
            ("[x]", "x"),
            ("A_{ab}", "A_a b"),
            ("{a+b}/c", "a+b/c"),
        ):
            with self.subTest(left=left, right=right):
                self.assertNotEqual(self.identity(left), self.identity(right))

    def test_parser_keeps_fraction_group_and_script_structure(self):
        fraction = parse_notation("{a+b}/c")
        self.assertTrue(fraction.ok, fraction)
        self.assertIsInstance(fraction.value[0], NotationFraction)
        self.assertIsInstance(fraction.value[0].numerator, NotationGroup)

        scripted = parse_notation("x_1^2")
        self.assertTrue(scripted.ok, scripted)
        self.assertIsInstance(scripted.value[0], NotationSubsup)

    def test_unicode_fallback_uses_only_explicit_identifier_scalars(self):
        for source in ("β", "ϴ", "ϵ", "ϰ", "ϱ", "ϖ"):
            with self.subTest(source=source):
                supported = parse_notation(source)
                self.assertTrue(supported.ok, supported)
                self.assertIsInstance(supported.value[0], NotationIdentifier)

        for source in ("é", "\u088f"):
            with self.subTest(source=source):
                unsupported = parse_notation(source)
                self.assertTrue(unsupported.ok, unsupported)
                self.assertIsInstance(unsupported.value[0], NotationText)
                self.assertEqual(unsupported.value[0].value, source)

    def test_diagnostics_use_unicode_scalar_offsets(self):
        cases = (
            ("", "EMPTY_EXPRESSION", 0),
            (" \t", "EMPTY_EXPRESSION", 2),
            ("{}", "EMPTY_GROUP", 1),
            ("a/", "MISSING_FRACTION_DENOMINATOR", 2),
            ('"missing', "UNCLOSED_QUOTE", 0),
            ("𝛼{missing", "UNCLOSED_GROUP", 1),
            ("𝛼}", "UNEXPECTED_CLOSING_GROUP", 1),
            ("{a]}", "UNEXPECTED_CLOSING_GROUP", 2),
            ("a/]", "UNEXPECTED_CLOSING_GROUP", 2),
            ("a\0b", "INVALID_CONTROL_CHARACTER", 1),
            ("\ud800", "INVALID_UNICODE", 0),
        )
        for source, code, offset in cases:
            with self.subTest(source=repr(source)):
                diagnostic = self.diagnostic(source)
                self.assertEqual((diagnostic.code, diagnostic.offset), (code, offset))
                if code == "UNEXPECTED_CLOSING_GROUP":
                    self.assertEqual(
                        diagnostic.message,
                        f"Unexpected closing group '{source[offset]}'",
                    )

    def test_source_node_and_group_limits_match_core(self):
        within_source_limit = parse_notation("𝛼" + "a" * (SOURCE_LIMIT - 1))
        self.assertTrue(within_source_limit.ok, within_source_limit)
        source_overflow = self.diagnostic("a" * (SOURCE_LIMIT + 1))
        self.assertEqual(
            (source_overflow.code, source_overflow.offset),
            ("NOTATION_SOURCE_LIMIT", SOURCE_LIMIT),
        )

        within_node_limit = parse_notation("+" * NODE_LIMIT)
        self.assertTrue(within_node_limit.ok, within_node_limit)
        node_overflow = self.diagnostic("+" * (NODE_LIMIT + 1))
        self.assertEqual(node_overflow.code, "NOTATION_NODE_LIMIT")

        within_depth_limit = parse_notation("{" * DEPTH_LIMIT + "x" + "}" * DEPTH_LIMIT)
        self.assertTrue(within_depth_limit.ok, within_depth_limit)
        depth_overflow = self.diagnostic(
            "{" * (DEPTH_LIMIT + 1) + "x" + "}" * (DEPTH_LIMIT + 1)
        )
        self.assertEqual(
            (depth_overflow.code, depth_overflow.offset),
            ("NOTATION_DEPTH_LIMIT", DEPTH_LIMIT),
        )


if __name__ == "__main__":
    unittest.main()
