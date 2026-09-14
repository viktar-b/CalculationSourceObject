"""Give distinct invocation quantities unambiguous document notation."""

import re

from .notation import source_notation_identity
from .source import Invocation, SourceError, Symbol


def glyph_identity(glyph: str) -> str:
    """Return the canonical display identity used for duplicate detection."""
    return source_notation_identity(glyph)


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
