// Teaching fragments only. Gallery data is supplied separately by the host.
export const pythonSnippet = `PanelWidth: TypeAlias = Annotated[
    float,
    symbol(
        glyph=r"w_{pan}",
        unit="m",
    ),
]
PanelHeight: TypeAlias = Annotated[
    float,
    symbol(
        glyph=r"h_{pan}",
        unit="m",
    ),
]

@calculation(
    id="panel-area-illustration",
    ...
)
@section(id="geometry", ...)
def panel_area(
    width: PanelWidth = 2,
    height: PanelHeight = 3,
) -> CalculationResults:
    area: Annotated[
        float,
        symbol(
            glyph=r"A_{rect}",
            unit="m^2",
            description="Panel area",
        ),
    ] = width * height
    return {"area": area}`;

export const sourceSnippet = `{
  "sections": [{ "items": [
    { "kind": "symbol", "symbol": {
        "id": "width", "glyph": "w_{pan}",
        "unit": "m", "valueTree": { "result": {
          "kind": "number", "value": 2 }, ... }
    }},
    { "kind": "symbol", "symbol": {
        "id": "height", "glyph": "h_{pan}",
        "unit": "m", "valueTree": { "result": {
          "kind": "number", "value": 3 }, ... }
    }},
    { "kind": "symbol", "symbol": {
        "id": "area", "glyph": "A_{rect}",
        "description": "Panel area",
        "unit": "m^2", "comment": "...",
        "valueTree": {
          "result": { "kind": "number",
            "value": 6 },
          "nodes": [..., {
            "mode": "FUNCTION",
            "funcSpec": {
              "id": "fg.multiply" },
            "funcArgs": [
              { "key": "width" },
              { "key": "height" }] }]
        }
    }}
  ]}, ...]
}`;

export const pipelineSteps = [
  {
    title: 'Annotated Python',
    body: 'Author constrained Python with shared input metadata, formulas and public results.',
  },
  {
    title: 'Capture and execute',
    body: 'Capture source bytes and execution observations. Produce a CalculationSourceObject plus evidence.',
  },
  {
    title: 'verifyExecution',
    body: 'Core evaluates documented formulas and compares runtime observations to check source-to-document consistency.',
  },
  {
    title: 'Optional independent references',
    body: 'Compare with separately established expected values bound to the source, function and inputs. Report agreement separately.',
  },
  {
    title: 'Prepare and display',
    body: 'Use prepareExecutionDocument and PreparedFormulaSheet for ordered documents, or FormulaSheet for mathematical rows.',
  },
] as const;
