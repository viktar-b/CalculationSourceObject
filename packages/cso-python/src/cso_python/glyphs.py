"""Give distinct invocation quantities unambiguous document notation."""

import json
import re
import unicodedata

from .source import Invocation, SourceError, Symbol

GREEK = dict(
    zip(
        [
            "alpha",
            "beta",
            "gamma",
            "delta",
            "epsilon",
            "varepsilon",
            "zeta",
            "eta",
            "theta",
            "vartheta",
            "iota",
            "kappa",
            "lambda",
            "mu",
            "nu",
            "xi",
            "pi",
            "rho",
            "sigma",
            "tau",
            "upsilon",
            "phi",
            "varphi",
            "chi",
            "psi",
            "omega",
            "Gamma",
            "Delta",
            "Theta",
            "Lambda",
            "Xi",
            "Pi",
            "Sigma",
            "Phi",
            "Psi",
            "Omega",
        ],
        "αβγδεɛζηθϑικλμνξπρστυϕφχψωΓΔΘΛΞΠΣΦΨΩ",
    )
)


def glyph_identity(glyph: str) -> str:
    """Normalize common equivalent spellings without flattening script structure."""
    value = unicodedata.normalize("NFKC", glyph)
    tokens = [
        unicodedata.normalize("NFKC", GREEK.get(token.lstrip("\\"), token))
        for token in re.findall(r"\\?[A-Za-z]+|[0-9]+|[^\s]", value)
    ]
    # Braces around a single token are invisible. Keep all other grouping and
    # token boundaries: A_ab and A_a b have different script structure.
    index = 0
    while index + 2 < len(tokens):
        if (
            tokens[index] == "{"
            and tokens[index + 2] == "}"
            and tokens[index + 1] not in {"{", "}"}
        ):
            tokens[index : index + 3] = [tokens[index + 1]]
            index = max(0, index - 1)
        else:
            index += 1
    return json.dumps(tokens, ensure_ascii=False, separators=(",", ":"))


def scoped_glyph(glyph: str, scope: str) -> str:
    # Keep full binding names in evidence and compact initials in the document.
    scopes = []
    for binding in scope.split(","):
        words = [word for word in binding.split("_") if word]
        scopes.append("".join(word[0] for word in words) if len(words) > 1 else binding)
    display_scope = ",".join(scopes)
    subscript = re.fullmatch(r"([^_^]+)_(?:\{([^{}]+)\}|([A-Za-z0-9]+))", glyph)
    if subscript:
        return f"{subscript[1]}_{{{subscript[2] or subscript[3]},{display_scope}}}"
    base = (
        glyph if re.fullmatch(r"[A-Za-z0-9]+|\\[A-Za-z]+", glyph) else "{" + glyph + "}"
    )
    return f"{base}_{{{display_scope}}}"


def qualify_glyphs(invocations: list[Invocation]) -> None:
    groups: dict[str, list[tuple[Invocation, Symbol]]] = {}

    def duplicate(inv: Invocation, symbol: Symbol, previous: Symbol) -> None:
        chain = []
        current = inv
        while current.parent is not None:
            chain.insert(0, current.record["callSite"])
            current = current.parent
        raise SourceError(
            "DUPLICATE_GLYPH",
            f"Distinct quantities {previous.name!r} and {symbol.name!r} share glyph "
            f"{symbol.cso['glyph']!r}; change the declaration glyph or call binding name",
            location=symbol.definition["definitionLocation"],
            related=[previous.definition["definitionLocation"]],
            symbolId=symbol.cso["id"],
            callChain=chain,
        )

    for inv in invocations:
        local: dict[str, Symbol] = {}
        for symbol in inv.symbols.values():
            key = glyph_identity(symbol.cso["glyph"])
            if key in local:
                duplicate(inv, symbol, local[key])
            local[key] = symbol
            groups.setdefault(key, []).append((inv, symbol))

    for group in groups.values():
        if len(group) < 2:
            continue
        for inv, symbol in group:
            if inv.parent is None:
                continue
            scope = ",".join(inv.id.split("/")[1:])
            authored = symbol.cso["glyph"]
            symbol.cso["glyph"] = scoped_glyph(authored, scope)
            symbol.cso["glyphPlaintext"] = symbol.cso["glyph"]
            symbol.cso["metadata"].update(authoredGlyph=authored, glyphScope=scope)

    assigned: dict[str, Symbol] = {}
    for inv in invocations:
        for symbol in inv.symbols.values():
            key = glyph_identity(symbol.cso["glyph"])
            if key in assigned:
                duplicate(inv, symbol, assigned[key])
            assigned[key] = symbol
