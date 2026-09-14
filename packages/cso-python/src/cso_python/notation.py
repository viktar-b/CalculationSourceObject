"""Parse the bounded notation language and derive its displayed identity."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import ClassVar, Literal, NoReturn, TypeAlias

SOURCE_LIMIT = 32_768
NODE_LIMIT = 16_384
DEPTH_LIMIT = 64


@dataclass(frozen=True)
class NotationIdentifier:
    value: str
    kind: ClassVar[Literal["identifier"]] = "identifier"


@dataclass(frozen=True)
class NotationNumber:
    value: str
    kind: ClassVar[Literal["number"]] = "number"


@dataclass(frozen=True)
class NotationOperator:
    value: str
    kind: ClassVar[Literal["operator"]] = "operator"


@dataclass(frozen=True)
class NotationText:
    value: str
    kind: ClassVar[Literal["text"]] = "text"


@dataclass(frozen=True)
class NotationGroup:
    fence: Literal["none", "round", "square"]
    body: NotationExpression
    kind: ClassVar[Literal["group"]] = "group"


@dataclass(frozen=True)
class NotationFraction:
    numerator: NotationNode
    denominator: NotationNode
    kind: ClassVar[Literal["fraction"]] = "fraction"


@dataclass(frozen=True)
class NotationSubscript:
    base: NotationNode
    subscript: NotationNode
    kind: ClassVar[Literal["subscript"]] = "subscript"


@dataclass(frozen=True)
class NotationSuperscript:
    base: NotationNode
    superscript: NotationNode
    kind: ClassVar[Literal["superscript"]] = "superscript"


@dataclass(frozen=True)
class NotationSubsup:
    base: NotationNode
    subscript: NotationNode
    superscript: NotationNode
    kind: ClassVar[Literal["subsup"]] = "subsup"


NotationNode: TypeAlias = (
    NotationIdentifier
    | NotationNumber
    | NotationOperator
    | NotationText
    | NotationGroup
    | NotationFraction
    | NotationSubscript
    | NotationSuperscript
    | NotationSubsup
)
NotationExpression: TypeAlias = tuple[NotationNode, ...]
NotationParseDiagnosticCode: TypeAlias = Literal[
    "EMPTY_EXPRESSION",
    "EMPTY_GROUP",
    "INVALID_CONTROL_CHARACTER",
    "INVALID_UNICODE",
    "MISSING_FRACTION_DENOMINATOR",
    "NOTATION_DEPTH_LIMIT",
    "NOTATION_NODE_LIMIT",
    "NOTATION_SOURCE_LIMIT",
    "UNCLOSED_GROUP",
    "UNCLOSED_QUOTE",
    "UNEXPECTED_CLOSING_GROUP",
]


@dataclass(frozen=True)
class NotationDiagnostic:
    code: NotationParseDiagnosticCode
    offset: int
    message: str


@dataclass(frozen=True)
class NotationParseSuccess:
    value: NotationExpression
    ok: ClassVar[Literal[True]] = True


@dataclass(frozen=True)
class NotationParseFailure:
    diagnostic: NotationDiagnostic
    ok: ClassVar[Literal[False]] = False


NotationParseResult: TypeAlias = NotationParseSuccess | NotationParseFailure
NotationAlias: TypeAlias = NotationIdentifier | NotationOperator


def _identifier(value: str) -> NotationIdentifier:
    return NotationIdentifier(value=value)


def _operator(value: str) -> NotationOperator:
    return NotationOperator(value=value)


_ALIAS_GROUPS: tuple[tuple[NotationAlias, tuple[str, ...]], ...] = (
    (_operator("+"), ("+",)),
    (_operator("−"), ("-",)),
    (_operator("⋅"), ("*", "cdot")),
    (_operator("*"), ("**", "ast")),
    (_operator("⋆"), ("***", "star")),
    (_operator("/"), ("//",)),
    (_operator("\\"), ("\\\\", "backslash", "setminus")),
    (_operator("×"), ("xx", "times")),
    (_operator("÷"), ("-:", "div")),
    (_operator("⋉"), ("|><", "ltimes")),
    (_operator("⋊"), ("><|", "rtimes")),
    (_operator("⋈"), ("|><|", "bowtie")),
    (_operator("∘"), ("@", "circ")),
    (_operator("⊕"), ("o+", "oplus")),
    (_operator("⊗"), ("ox", "otimes")),
    (_operator("⊙"), ("o.", "odot")),
    (_operator("∑"), ("sum",)),
    (_operator("∏"), ("prod",)),
    (_operator("∧"), ("^^", "wedge")),
    (_operator("⋀"), ("^^^", "bigwedge")),
    (_operator("∨"), ("vv", "vee")),
    (_operator("⋁"), ("vvv", "bigvee")),
    (_operator("∩"), ("nn", "cap")),
    (_operator("⋂"), ("nnn", "bigcap")),
    (_operator("∪"), ("uu", "cup")),
    (_operator("⋃"), ("uuu", "bigcup")),
    (_operator("∫"), ("int",)),
    (_operator("∮"), ("oint",)),
    (_operator("∂"), ("del", "partial")),
    (_operator("∇"), ("grad", "nabla")),
    (_operator("±"), ("+-", "pm")),
    (_operator("∅"), ("O/", "emptyset")),
    (_operator("∞"), ("oo", "infty")),
    (_identifier("ℵ"), ("aleph",)),
    (_operator("∴"), (":.", "therefore")),
    (_operator("∵"), (":'", "because")),
    (_operator("|...|"), ("|...|", "|ldots|")),
    (_operator("|⋯|"), ("|cdots|",)),
    (_operator("⋮"), ("vdots",)),
    (_operator("⋱"), ("ddots",)),
    (_operator("∠"), ("/_", "angle")),
    (_operator("⌢"), ("frown",)),
    (_operator("△"), ("/_\\", "triangle")),
    (_operator("⋄"), ("diamond",)),
    (_operator("□"), ("square",)),
    (_operator("⌊"), ("|__", "lfloor")),
    (_operator("⌋"), ("__|", "rfloor")),
    (_operator("⌈"), ("|~", "lceiling")),
    (_operator("⌉"), ("~|", "rceiling")),
    (_identifier("ℂ"), ("CC",)),
    (_identifier("ℕ"), ("NN",)),
    (_identifier("ℚ"), ("QQ",)),
    (_identifier("ℝ"), ("RR",)),
    (_identifier("ℤ"), ("ZZ",)),
    (_operator("="), ("=",)),
    (_operator("≠"), ("!=", "ne")),
    (_operator("<"), ("<", "lt")),
    (_operator(">"), (">", "gt")),
    (_operator("≤"), ("<=", "le")),
    (_operator("≥"), (">=", "ge")),
    (_operator("≪"), ("mlt", "ll")),
    (_operator("≫"), ("mgt", "gg")),
    (_operator("≺"), ("-<", "prec")),
    (_operator("⪯"), ("-<=", "preceq")),
    (_operator("≻"), (">-", "succ")),
    (_operator("⪰"), (">-=", "succeq")),
    (_operator("∈"), ("in",)),
    (_operator("∉"), ("!in", "notin")),
    (_operator("⊂"), ("sub", "subset")),
    (_operator("⊃"), ("sup", "supset")),
    (_operator("⊆"), ("sube", "subseteq")),
    (_operator("⊇"), ("supe", "supseteq")),
    (_operator("≡"), ("-=", "equiv")),
    (_operator("≅"), ("~=", "cong")),
    (_operator("≈"), ("~~", "approx")),
    (_operator("∝"), ("prop", "propto")),
    (_operator("and"), ("and",)),
    (_operator("or"), ("or",)),
    (_operator("¬"), ("not", "neg")),
    (_operator("⇒"), ("=>", "implies")),
    (_operator("if"), ("if",)),
    (_operator("⇔"), ("<=>", "iff")),
    (_operator("∀"), ("AA", "forall")),
    (_operator("∃"), ("EE", "exists")),
    (_operator("⊥"), ("_|_", "bot")),
    (_operator("⊤"), ("TT", "top")),
    (_operator("⊢"), ("|--", "vdash")),
    (_operator("⊨"), ("|==", "models")),
    (_operator("↑"), ("uarr", "uparrow")),
    (_operator("↓"), ("darr", "downarrow")),
    (_operator("→"), ("rarr", "rightarrow", "->", "to")),
    (_operator("↣"), (">->", "rightarrowtail")),
    (_operator("↠"), ("->>", "twoheadrightarrow")),
    (_operator("⤖"), (">->>", "twoheadrightarrowtail")),
    (_operator("↦"), ("|->", "mapsto")),
    (_operator("←"), ("larr", "leftarrow")),
    (_operator("↔"), ("harr", "leftrightarrow")),
    (_operator("⇒"), ("rArr", "Rightarrow")),
    (_operator("⇐"), ("lArr", "Leftarrow")),
    (_operator("⇔"), ("hArr", "Leftrightarrow")),
)

_GREEK_NAMES = (
    "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota "
    "kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega "
    "Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega"
).split()
_GREEK_LETTERS = tuple("αβγδεɛζηθϑικλμνξπρστυϕφχψωΓΔΘΛΞΠΣΦΨΩ")

_ALIASES = {
    spelling: resolved
    for resolved, spellings in _ALIAS_GROUPS
    for spelling in spellings
}
_ALIASES.update(
    {name: _identifier(value) for name, value in zip(_GREEK_NAMES, _GREEK_LETTERS)}
)
_BACKSLASH_ALIASES = frozenset(_GREEK_NAMES)
_PUNCTUATION_ALIASES = tuple(
    sorted(
        (spelling for spelling in _ALIASES if not spelling.isascii() or not spelling.isalpha()),
        key=len,
        reverse=True,
    )
)
_CANONICAL_SCALARS = {
    resolved.value: resolved for resolved in _ALIASES.values() if len(resolved.value) == 1
}
_PRESENTATION_EQUIVALENT_ALPHABETS = (
    (
        "𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ),
    (
        "𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧",
        "abcdefghijklmnopqrstuvwxyz",
    ),
    ("𝚤𝚥", "ıȷ"),
    (
        "𝛢𝛣𝛤𝛥𝛦𝛧𝛨𝛩𝛪𝛫𝛬𝛭𝛮𝛯𝛰𝛱𝛲𝛳𝛴𝛵𝛶𝛷𝛸𝛹𝛺",
        "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ",
    ),
    (
        "𝛼𝛽𝛾𝛿𝜀𝜁𝜂𝜃𝜄𝜅𝜆𝜇𝜈𝜉𝜊𝜋𝜌𝜍𝜎𝜏𝜐𝜑𝜒𝜓𝜔",
        "αβγδεζηθικλμνξοπρςστυφχψω",
    ),
    ("𝜖𝜗𝜘𝜙𝜚𝜛", "ϵϑϰϕϱϖ"),
)
_PRESENTATION_EQUIVALENTS = {
    styled_scalar: plain_scalar
    for styled, plain in _PRESENTATION_EQUIVALENT_ALPHABETS
    for styled_scalar, plain_scalar in zip(styled, plain)
}
_SUPPORTED_GREEK_IDENTIFIERS = frozenset(
    "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ"
    "αβγδεζηθικλμνξοπρςστυφχψω"
    "ɛϴϵϑϰϕϱϖ"
)
_EXPLICIT_IDENTIFIER_SCALARS = (
    _SUPPORTED_GREEK_IDENTIFIERS | _PRESENTATION_EQUIVALENTS.keys()
)


class _NotationParseError(Exception):
    def __init__(self, diagnostic: NotationDiagnostic):
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic


class _NotationParser:
    def __init__(self, source: str):
        self.index = 0
        self.node_count = 0
        self.characters = source
        if len(source) > SOURCE_LIMIT * 2:
            self.fail(
                "NOTATION_SOURCE_LIMIT",
                SOURCE_LIMIT,
                f"Notation exceeds {SOURCE_LIMIT} Unicode scalar values",
            )
        for offset, value in enumerate(self.characters):
            if 0xD800 <= ord(value) <= 0xDFFF:
                self.fail(
                    "INVALID_UNICODE",
                    offset,
                    "Notation contains an isolated UTF-16 surrogate",
                )
            if value == "\0":
                self.fail(
                    "INVALID_CONTROL_CHARACTER",
                    offset,
                    "Notation contains a NUL control character",
                )
        if len(source) > SOURCE_LIMIT:
            self.fail(
                "NOTATION_SOURCE_LIMIT",
                SOURCE_LIMIT,
                f"Notation exceeds {SOURCE_LIMIT} Unicode scalar values",
            )

    def parse(self) -> NotationExpression:
        self.skip_whitespace()
        if self.peek() is None:
            self.fail("EMPTY_EXPRESSION", self.index, "Notation is empty")
        expression = self.parse_expression(None, 0)
        self.skip_whitespace()
        return expression

    def parse_expression(
        self, stop_character: str | None, depth: int
    ) -> NotationExpression:
        nodes: list[NotationNode] = []
        while True:
            self.skip_whitespace()
            if self.peek() is None or self.peek() == stop_character:
                break
            if self.peek() in {"}", ")", "]"}:
                closing = self.peek()
                self.fail(
                    "UNEXPECTED_CLOSING_GROUP",
                    self.index,
                    f"Unexpected closing group '{closing}'",
                )
            numerator = self.parse_scripted(stop_character, depth)
            self.skip_whitespace()
            if self.peek() == "/" and self.match_punctuation_alias() is None:
                self.index += 1
                self.skip_whitespace()
                if self.peek() is None or self.peek() == stop_character:
                    self.fail(
                        "MISSING_FRACTION_DENOMINATOR",
                        self.index,
                        "Fraction is missing a denominator",
                    )
                nodes.append(
                    self.node(
                        NotationFraction(
                            numerator=numerator,
                            denominator=self.parse_scripted(stop_character, depth),
                        )
                    )
                )
            else:
                nodes.append(numerator)
        if not nodes:
            if stop_character is None:
                self.fail("EMPTY_EXPRESSION", self.index, "Notation is empty")
            self.fail("EMPTY_GROUP", self.index, "Notation group is empty")
        return tuple(nodes)

    def parse_scripted(self, stop_character: str | None, depth: int) -> NotationNode:
        base = self.parse_atom(depth)
        subscript: NotationNode | None = None
        superscript: NotationNode | None = None
        self.skip_whitespace()
        if (
            self.peek() == "_"
            and self.match_punctuation_alias() is None
            and self.can_parse_script_argument(stop_character)
        ):
            self.index += 1
            subscript = self.parse_atom_after_whitespace(depth)
        self.skip_whitespace()
        if (
            self.peek() == "^"
            and self.match_punctuation_alias() is None
            and self.can_parse_script_argument(stop_character)
        ):
            self.index += 1
            superscript = self.parse_atom_after_whitespace(depth)
        if subscript is not None and superscript is not None:
            return self.node(
                NotationSubsup(
                    base=base, subscript=subscript, superscript=superscript
                )
            )
        if subscript is not None:
            return self.node(NotationSubscript(base=base, subscript=subscript))
        if superscript is not None:
            return self.node(NotationSuperscript(base=base, superscript=superscript))
        return base

    def parse_atom_after_whitespace(self, depth: int) -> NotationNode:
        self.skip_whitespace()
        return self.parse_atom(depth)

    def parse_atom(self, depth: int) -> NotationNode:
        character = self.peek()
        if character is None:
            self.fail("EMPTY_EXPRESSION", self.index, "Expected a notation token")
        if character == "{":
            return self.parse_group("}", "none", depth)
        if character == "(":
            return self.parse_group(")", "round", depth)
        if character == "[":
            return self.parse_group("]", "square", depth)
        if character == '"':
            return self.parse_quoted_text()
        if character in {"}", ")", "]"}:
            self.fail(
                "UNEXPECTED_CLOSING_GROUP",
                self.index,
                f"Unexpected closing group '{character}'",
            )
        number = self.parse_number()
        if number is not None:
            return self.node(NotationNumber(value=number))
        punctuation = self.match_punctuation_alias()
        if punctuation is not None:
            self.index += len(punctuation)
            return self.node(_ALIASES[punctuation])
        if character == "\\":
            return self.parse_backslash_word()
        word = self.parse_word()
        if word is not None:
            return self.node(_ALIASES.get(word, _identifier(word)))
        self.index += 1
        canonical = _CANONICAL_SCALARS.get(character)
        if canonical is not None:
            return self.node(canonical)
        if character in _EXPLICIT_IDENTIFIER_SCALARS:
            return self.node(_identifier(character))
        return self.node(NotationText(value=character))

    def parse_group(
        self,
        closing: str,
        fence: Literal["none", "round", "square"],
        depth: int,
    ) -> NotationNode:
        if depth >= DEPTH_LIMIT:
            self.fail(
                "NOTATION_DEPTH_LIMIT",
                self.index,
                f"Notation exceeds {DEPTH_LIMIT} nested groups",
            )
        opening_offset = self.index
        self.index += 1
        body = self.parse_expression(closing, depth + 1)
        if self.peek() != closing:
            self.fail(
                "UNCLOSED_GROUP",
                opening_offset,
                f"Notation group is missing '{closing}'",
            )
        self.index += 1
        return self.node(NotationGroup(fence=fence, body=body))

    def parse_quoted_text(self) -> NotationNode:
        opening_offset = self.index
        value: list[str] = []
        self.index += 1
        while self.peek() is not None:
            character = self.peek()
            if character == '"':
                self.index += 1
                return self.node(NotationText(value="".join(value)))
            if character == "\\" and self.peek(1) is not None:
                value.append(self.peek(1) or "")
                self.index += 2
            else:
                value.append(character or "")
                self.index += 1
        self.fail(
            "UNCLOSED_QUOTE",
            opening_offset,
            "Notation text is missing a closing quote",
        )

    def parse_backslash_word(self) -> NotationNode:
        start = self.index
        self.index += 1
        word = self.parse_word()
        if word is not None and word in _BACKSLASH_ALIASES:
            return self.node(_ALIASES[word])
        return self.node(NotationIdentifier(value=self.characters[start : self.index]))

    def parse_number(self) -> str | None:
        start = self.index
        cursor = start
        if self.at(cursor) == "-":
            cursor += 1
        integer_start = cursor
        while self.is_ascii_digit(self.at(cursor)):
            cursor += 1
        has_integer = cursor > integer_start
        if self.at(cursor) == ".":
            cursor += 1
            fraction_start = cursor
            while self.is_ascii_digit(self.at(cursor)):
                cursor += 1
            if not has_integer and cursor == fraction_start:
                return None
        elif not has_integer:
            return None
        self.index = cursor
        return self.characters[start:cursor]

    def parse_word(self) -> str | None:
        start = self.index
        while self.is_ascii_letter(self.peek()):
            self.index += 1
        if self.index == start:
            return None
        return self.characters[start : self.index]

    def can_parse_script_argument(self, stop_character: str | None) -> bool:
        cursor = self.index + 1
        while self.is_whitespace(self.at(cursor)):
            cursor += 1
        next_character = self.at(cursor)
        return (
            next_character is not None
            and next_character != stop_character
            and next_character not in {"(", "[", ")", "]"}
        )

    def match_punctuation_alias(self) -> str | None:
        for spelling in _PUNCTUATION_ALIASES:
            end = self.index + len(spelling)
            if self.characters[self.index : end] != spelling:
                continue
            if self.is_ascii_letter(spelling[-1]) and self.is_ascii_letter(self.at(end)):
                continue
            return spelling
        return None

    def node(self, node: NotationNode) -> NotationNode:
        self.node_count += 1
        if self.node_count > NODE_LIMIT:
            self.fail(
                "NOTATION_NODE_LIMIT",
                self.index,
                f"Notation exceeds {NODE_LIMIT} parsed nodes",
            )
        return node

    def skip_whitespace(self) -> None:
        while self.is_whitespace(self.peek()):
            self.index += 1

    def peek(self, ahead: int = 0) -> str | None:
        return self.at(self.index + ahead)

    def at(self, index: int) -> str | None:
        return self.characters[index] if index < len(self.characters) else None

    @staticmethod
    def is_ascii_letter(value: str | None) -> bool:
        return value is not None and value.isascii() and value.isalpha()

    @staticmethod
    def is_ascii_digit(value: str | None) -> bool:
        return value is not None and "0" <= value <= "9"

    @staticmethod
    def is_whitespace(value: str | None) -> bool:
        if value is None:
            return False
        return value in "\t\n\v\f\r \u00a0\u1680\u2028\u2029\u202f\u205f\u3000\ufeff" or (
            "\u2000" <= value <= "\u200a"
        )

    def fail(
        self, code: NotationParseDiagnosticCode, offset: int, message: str
    ) -> NoReturn:
        raise _NotationParseError(NotationDiagnostic(code, offset, message))


def parse_notation(source: str) -> NotationParseResult:
    """Return a parsed expression or a stable diagnostic for any string."""
    try:
        return NotationParseSuccess(_NotationParser(source).parse())
    except _NotationParseError as error:
        return NotationParseFailure(error.diagnostic)


Identity: TypeAlias = str | list["Identity"]


def _scalar_identity(
    value: str,
    style: Literal["italic", "normal"],
    normalize_presentation: bool = False,
) -> Identity:
    if normalize_presentation:
        value = _PRESENTATION_EQUIVALENTS.get(value, value)
    return ["scalar", style, value]


def _expression_body_identity(expression: NotationExpression) -> Identity:
    identities: list[Identity] = []
    pending = list(reversed(expression))
    while pending:
        node = pending.pop()
        if isinstance(node, NotationGroup) and node.fence == "none":
            pending.extend(reversed(node.body))
        else:
            identities.append(_node_identity(node))
    if len(identities) == 1:
        return identities[0]
    return ["sequence", *identities]


def _node_identity(node: NotationNode) -> Identity:
    if isinstance(node, NotationIdentifier):
        return _scalar_identity(
            node.value,
            "italic" if len(node.value) == 1 else "normal",
            normalize_presentation=True,
        )
    if isinstance(node, (NotationNumber, NotationText)):
        return _scalar_identity(node.value, "normal")
    if isinstance(node, NotationOperator):
        return ["operator", node.value]
    if isinstance(node, NotationGroup):
        body = _expression_body_identity(node.body)
        return body if node.fence == "none" else ["group", node.fence, body]
    if isinstance(node, NotationFraction):
        return [
            "fraction",
            _node_identity(node.numerator),
            _node_identity(node.denominator),
        ]
    if isinstance(node, NotationSubscript):
        return [
            "subscript",
            _node_identity(node.base),
            _node_identity(node.subscript),
        ]
    if isinstance(node, NotationSuperscript):
        return [
            "superscript",
            _node_identity(node.base),
            _node_identity(node.superscript),
        ]
    return [
        "subsup",
        _node_identity(node.base),
        _node_identity(node.subscript),
        _node_identity(node.superscript),
    ]


def notation_identity(expression: NotationExpression) -> str:
    """Serialize a canonical identity for the display represented by a parsed tree."""
    return json.dumps(
        ["notation", _expression_body_identity(expression)],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def source_notation_identity(source: str) -> str:
    """Return display identity, with a stable marker for malformed notation."""
    parsed = parse_notation(source)
    if parsed.ok:
        return notation_identity(parsed.value)
    return json.dumps(
        ["invalid-notation", source], ensure_ascii=False, separators=(",", ":")
    )
