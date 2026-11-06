"""A 3 by 3 comparison, nine named reuses and downstream arithmetic."""
from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table, text
from _cso_bindings.axial import response

@calculation(id="nine-cell-reuse", title="Nine table values reused downstream")
@section(id="reuse-example", title="Table results remain calculation quantities", root=True)
def demonstrate() -> CalculationResults:
    text(id="scope", content="Three independent cases use stiffness 1,000,000 N/m and gauge length 2 m. Qualifiers ca, cb and cg identify Alpha, Beta and Gamma. Nine new names below reuse the table cells. Sums and the 10 percent allowance are illustrative.")
    method(id="response-method", calculation=response, title="Common calculation for each case")
    case_alpha = response(force=1000.0)
    case_beta = response(force=2000.0)
    case_gamma = response(force=3000.0)
    table(id="nine-results", method="response-method", title="Three quantities across three cases", cases={"Alpha / 1 kN": case_alpha, "Beta / 2 kN": case_beta, "Gamma / 3 kN": case_gamma}, inputs=(), outputs=("extension", "strain", "energy"))
    alpha_extension: Annotated[float, symbol(glyph=r"u_{alpha}", description="Alpha extension (new name)", unit="m")] = case_alpha["extension"]
    alpha_strain: Annotated[float, symbol(glyph=r"epsilon_{alpha}", description="Alpha strain (new name)", unit="")] = case_alpha["strain"]
    alpha_energy: Annotated[float, symbol(glyph=r"U_{alpha}", description="Alpha energy (new name)", unit="J")] = case_alpha["energy"]
    beta_extension: Annotated[float, symbol(glyph=r"u_{beta}", description="Beta extension (new name)", unit="m")] = case_beta["extension"]
    beta_strain: Annotated[float, symbol(glyph=r"epsilon_{beta}", description="Beta strain (new name)", unit="")] = case_beta["strain"]
    beta_energy: Annotated[float, symbol(glyph=r"U_{beta}", description="Beta energy (new name)", unit="J")] = case_beta["energy"]
    gamma_extension: Annotated[float, symbol(glyph=r"u_{gamma}", description="Gamma extension (new name)", unit="m")] = case_gamma["extension"]
    gamma_strain: Annotated[float, symbol(glyph=r"epsilon_{gamma}", description="Gamma strain (new name)", unit="")] = case_gamma["strain"]
    gamma_energy: Annotated[float, symbol(glyph=r"U_{gamma}", description="Gamma energy (new name)", unit="J")] = case_gamma["energy"]
    total_extension: Annotated[float, symbol(glyph=r"u_{sum}", description="Sum of the three case extensions", unit="m")] = alpha_extension + beta_extension + gamma_extension
    total_strain: Annotated[float, symbol(glyph=r"epsilon_{sum}", description="Sum of the three case strains", unit="")] = alpha_strain + beta_strain + gamma_strain
    total_energy: Annotated[float, symbol(glyph=r"U_{sum}", description="Sum of the three case energies", unit="J")] = alpha_energy + beta_energy + gamma_energy
    revised_alpha_extension: Annotated[float, symbol(glyph=r"u_{alpha,new}", description="Revised Alpha extension", unit="m")] = 1.1 * alpha_extension
    return {"total_extension": total_extension, "total_strain": total_strain, "total_energy": total_energy, "revised_alpha_extension": revised_alpha_extension}

