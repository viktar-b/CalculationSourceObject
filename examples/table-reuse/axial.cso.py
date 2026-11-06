"""Three public results for a linear axial spring."""
from cso_python import CalculationResults, calculation, section
from quantities import AppliedForce, AxialStiffness, GaugeLength, Extension, Strain, Energy

@calculation(id="axial-case", title="Linear axial response")
@section(id="axial-response", title="Axial response")
def response(force: AppliedForce, stiffness: AxialStiffness = 1000000.0, length: GaugeLength = 2.0) -> CalculationResults:
    extension: Extension = force / stiffness
    strain: Strain = extension / length
    energy: Energy = force * extension / 2
    return {"extension": extension, "strain": strain, "energy": energy}

