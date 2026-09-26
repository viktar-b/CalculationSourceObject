"""Numerical transcription of Enji’s hot-formed i-section template."""

import math
from typing import Annotated
from cso_python import CalculationResults, calculation, section, symbol


@calculation(
    id="hot-formed-I-sections",
    title="Hot-formed I-section",
    metadata={
        "referenceUrl": "https://www.enji.io/templates/basic-section-properties/hot-formed-I-sections",
        "referenceExportSha256": "7fbf069c21693a0c845adeb9cfd1398bcb82c47843ba3a6ccb683b2c406438dc",
    },
)
@section(id="properties", title="Section properties", root=True)
def calculate(
    section_depth: Annotated[
        float, symbol(glyph="h_{t}", description="Section depth", unit="mm")
    ] = 1056,
    section_width: Annotated[
        float, symbol(glyph="b_{t}", description="Section width", unit="mm")
    ] = 314,
    web_thickness: Annotated[
        float, symbol(glyph="t_{w}", description="Web thickness", unit="mm")
    ] = 36,
    flange_thickness: Annotated[
        float, symbol(glyph="t_{f}", description="Flange thickness", unit="mm")
    ] = 64,
    root_radius: Annotated[
        float, symbol(glyph="r_{t}", description="Root radius", unit="mm")
    ] = 30,
    young_modulus: Annotated[
        float, symbol(glyph="E_{t}", description="Young's modulus", unit="N/mm^2")
    ] = 210000,
    poisson_ratio: Annotated[
        float, symbol(glyph="v_{t}", description="Poisson's ratio", unit="")
    ] = 0.3,
    density: Annotated[
        float, symbol(glyph="ρ_{t}", description="Density", unit="kg/m^3")
    ] = 7850,
) -> CalculationResults:
    shear_modulus: Annotated[
        float,
        symbol(id="G_t", glyph="G_{t}", description="Shear modulus", unit="N/mm^2"),
    ] = young_modulus / (2 * (1 + poisson_ratio))

    depth_of_web: Annotated[
        float, symbol(id="h_w", glyph="h_{w}", description="Depth of web", unit="mm")
    ] = (section_depth - 2 * flange_thickness)

    depth_between_fillets: Annotated[
        float,
        symbol(id="d_t", glyph="d_{t}", description="Depth between fillets", unit="mm"),
    ] = (
        section_depth - 2 * flange_thickness - 2 * root_radius
    )

    distance_from_major_axis_to_flange_centroid: Annotated[
        float,
        symbol(
            id="h_f",
            glyph="h_{f}",
            description="Distance from major axis to flange centroid",
            unit="mm",
        ),
    ] = (
        section_depth / 2 - flange_thickness / 2
    )

    distance_to_centroid_in_the_y_y_axis: Annotated[
        float,
        symbol(
            id="C_y",
            glyph="C_{y}",
            description="Distance to centroid in the y-y axis",
            unit="mm",
        ),
    ] = (
        section_width / 2
    )

    distance_to_centroid_in_the_z_z_axis: Annotated[
        float,
        symbol(
            id="C_z",
            glyph="C_{z}",
            description="Distance to centroid in the z-z axis",
            unit="mm",
        ),
    ] = (
        section_depth / 2
    )

    cross_section_area_1: Annotated[
        float,
        symbol(
            id="A_I", glyph="A_{I}", description="Cross-sectional area (1)", unit="mm^2"
        ),
    ] = (
        2 * section_width * flange_thickness + depth_of_web * web_thickness
    )

    flange_area: Annotated[
        float,
        symbol(
            id="A_flange", glyph="A_{flange}", description="Flange area", unit="mm^2"
        ),
    ] = (
        section_width * flange_thickness
    )

    web_area: Annotated[
        float, symbol(id="A_web", glyph="A_{web}", description="Web area", unit="mm^2")
    ] = (depth_of_web * web_thickness)

    cross_section_area_2: Annotated[
        float,
        symbol(
            id="A_root",
            glyph="A_{root}",
            description="Cross-sectional area (2)",
            unit="mm^2",
        ),
    ] = root_radius**2 * (1 - math.pi / 4)

    cross_section_area: Annotated[
        float,
        symbol(
            id="A_t", glyph="A_{t}", description="Cross-sectional area", unit="mm^2"
        ),
    ] = (
        web_area + 2 * flange_area + 4 * cross_section_area_2
    )

    mass_per_metre_length: Annotated[
        float,
        symbol(
            id="m_m", glyph="m_{m}", description="Mass per metre length", unit="kg/m"
        ),
    ] = (
        cross_section_area * density / 1000000
    )

    web_slenderness: Annotated[
        float,
        symbol(
            id="c_w_div_t_w",
            glyph="(c_{w})/(t_{w})",
            description="Web slenderness",
            unit="",
        ),
    ] = (section_depth - 2 * (flange_thickness + root_radius)) / web_thickness

    flange_slenderness: Annotated[
        float,
        symbol(
            id="c_f_div_t_f",
            glyph="(c_{f})/(t_{f})",
            description="Flange slenderness",
            unit="",
        ),
    ] = (
        0.5 * (section_width - (web_thickness + 2 * root_radius)) / flange_thickness
    )

    end_clearance: Annotated[
        float,
        symbol(
            id="C_end_clearance",
            glyph="C_{end,clearance}",
            description="End clearance",
            unit="mm",
        ),
    ] = round(web_thickness / 2 + 2)

    notch_width: Annotated[
        float,
        symbol(id="N_notch", glyph="N_{notch}", description="Notch width", unit="mm"),
    ] = (
        math.ceil(((section_width - web_thickness) / 2 + 10) * 0.5) * 2
    )

    notch_depth: Annotated[
        float,
        symbol(id="n_notch", glyph="n_{notch}", description="Notch depth", unit=""),
    ] = (
        math.ceil((section_depth - depth_between_fillets) / 2 * 0.5) * 2
    )

    surface_area_per_metre: Annotated[
        float,
        symbol(
            id="A_m", glyph="A_{m}", description="Surface Area per Metre", unit="mm^2"
        ),
    ] = (
        2 * section_depth
        + 4 * section_width
        + 2 * math.pi * root_radius
        - 8 * root_radius
        - 2 * web_thickness
    )

    surface_area_per_tonne: Annotated[
        float,
        symbol(
            id="A_m_div_m_m",
            glyph="(A_{m})/(m_{m})",
            description="Surface Area per Tonne",
            unit="mm^2 / t",
        ),
    ] = (
        surface_area_per_metre / mass_per_metre_length
    )

    major_axis_rectangular_second_moment: Annotated[
        float,
        symbol(
            id="I_yy_1",
            glyph="I_{yy_{1}}",
            description="Second moment of area about major axis (1)",
            unit="mm^4",
        ),
    ] = (
        2 * flange_area * flange_thickness**2 / 12
        + 2 * flange_area * distance_from_major_axis_to_flange_centroid**2
        + web_area * depth_of_web**2 / 12
    )

    major_axis_root_second_moment: Annotated[
        float,
        symbol(
            id="I_yy_2",
            glyph="I_{yy_{2}}",
            description="Second moment of area about major axis (1)",
            unit="mm^4",
        ),
    ] = (
        4
        * cross_section_area_2
        * (depth_between_fillets / 2 + 0.7766 * root_radius) ** 2
    )

    second_moment_of_area_about_major_axis: Annotated[
        float,
        symbol(
            id="I_yy",
            glyph="I_{yy}",
            description="Second moment of area about major axis",
            unit="mm^4",
        ),
    ] = (
        major_axis_rectangular_second_moment + major_axis_root_second_moment
    )

    second_moment_of_area_about_minor_axis: Annotated[
        float,
        symbol(
            id="I_zz",
            glyph="I_{zz}",
            description="Second moment of area about minor axis",
            unit="mm^4",
        ),
    ] = (
        2 * flange_area * section_width**2 / 12
        + web_area * web_thickness**2 / 12
        + 4 * cross_section_area_2 * (web_thickness / 2 + 0.2234 * root_radius) ** 2
    )

    radius_of_gyration_about_major_axis: Annotated[
        float,
        symbol(
            id="K_yy",
            glyph="K_{yy}",
            description="Radius of gyration about major axis",
            unit="mm",
        ),
    ] = math.sqrt(second_moment_of_area_about_major_axis / cross_section_area)

    radius_of_gyration_about_minor_axis: Annotated[
        float,
        symbol(
            id="K_zz",
            glyph="K_{zz}",
            description="Radius of gyration about minor axis",
            unit="mm",
        ),
    ] = math.sqrt(second_moment_of_area_about_minor_axis / cross_section_area)

    elastic_section_modulus_about_the_major_axis: Annotated[
        float,
        symbol(
            id="S_yy",
            glyph="S_{yy}",
            description="Elastic section modulus about the major axis",
            unit="mm^3",
        ),
    ] = (
        second_moment_of_area_about_major_axis / distance_to_centroid_in_the_z_z_axis
    )

    elastic_section_modulus_about_the_minor_axis: Annotated[
        float,
        symbol(
            id="S_zz",
            glyph="S_{zz}",
            description="Elastic section modulus about the minor axis",
            unit="mm^3",
        ),
    ] = (
        second_moment_of_area_about_minor_axis / distance_to_centroid_in_the_y_y_axis
    )

    major_axis_rectangular_plastic_modulus: Annotated[
        float,
        symbol(
            id="Z_Pyy_1",
            glyph="Z_{Pyy_{1}}",
            description="Plastic section modulus about major axis (1)",
            unit="mm^3",
        ),
    ] = (
        2 * flange_area * distance_from_major_axis_to_flange_centroid
        + web_area * depth_of_web / 4
    )

    major_axis_root_plastic_modulus: Annotated[
        float,
        symbol(
            id="Z_Pyy_2",
            glyph="Z_{Pyy_{2}}",
            description="Plastic section modulus about major axis (2)",
            unit="mm^3",
        ),
    ] = (
        4 * cross_section_area_2 * (depth_between_fillets / 2 + 0.7766 * root_radius)
    )

    plastic_section_modulus_about_major_axis: Annotated[
        float,
        symbol(
            id="Z_Pyy",
            glyph="Z_{Pyy}",
            description="Plastic section modulus about major axis",
            unit="mm^3",
        ),
    ] = (
        major_axis_rectangular_plastic_modulus + major_axis_root_plastic_modulus
    )

    plastic_section_modulus_about_minor_axis: Annotated[
        float,
        symbol(
            id="Z_Pzz",
            glyph="Z_{Pzz}",
            description="Plastic section modulus about minor axis",
            unit="mm^3",
        ),
    ] = (
        2 * flange_area * (section_width / 4)
        + web_area * (web_thickness / 4)
        + 4 * cross_section_area_2 * (web_thickness / 2 + 0.2234 * root_radius)
    )

    warping_constant: Annotated[
        float,
        symbol(id="I_w", glyph="I_{w}", description="Warping constant", unit="mm^6"),
    ] = (
        second_moment_of_area_about_minor_axis
        * (section_depth - flange_thickness) ** 2
        / 4
    )

    torsion_geometric_coefficient: Annotated[
        float,
        symbol(
            id="alpha_1", glyph="α_{1}", description="Geometric coefficient", unit=""
        ),
    ] = (
        0.2204 * web_thickness / flange_thickness
        - 0.042
        + 0.1355 * root_radius / flange_thickness
        - 0.0865 * root_radius * web_thickness / flange_thickness**2
        - 0.0725 * web_thickness**2 / flange_thickness**2
    )

    torsion_geometric_dimension: Annotated[
        float,
        symbol(id="D_1", glyph="D_{1}", description="Geometric coefficient", unit="mm"),
    ] = (flange_thickness + root_radius) ** 2 / (2 * root_radius + flange_thickness) + (
        root_radius + 0.25 * web_thickness
    ) * web_thickness / (
        2 * root_radius + flange_thickness
    )

    torsional_constant: Annotated[
        float,
        symbol(id="I_T", glyph="I_{T}", description="Torsional constant", unit="mm^4"),
    ] = (
        2 / 3 * section_width * flange_thickness**3
        + 1 / 3 * (section_depth - 2 * flange_thickness) * web_thickness**3
        + 2 * torsion_geometric_coefficient * torsion_geometric_dimension**4
        - 0.42 * flange_thickness**4
    )

    torsional_index: Annotated[
        float, symbol(id="X", glyph="X", description="Torsional index", unit="")
    ] = math.sqrt(
        math.pi**2
        * young_modulus
        * cross_section_area
        * warping_constant
        / (
            20
            * shear_modulus
            * torsional_constant
            * second_moment_of_area_about_minor_axis
        )
    )

    buckling_geometric_coefficient: Annotated[
        float, symbol(id="g", glyph="g", description="Geometric coefficient", unit="")
    ] = math.sqrt(
        1
        - second_moment_of_area_about_minor_axis
        / second_moment_of_area_about_major_axis
    )

    buckling_parameter: Annotated[
        float, symbol(id="U", glyph="U", description="Buckling parameter", unit="")
    ] = (
        plastic_section_modulus_about_major_axis
        * buckling_geometric_coefficient
        / cross_section_area
    ) ** 0.5 * (
        second_moment_of_area_about_minor_axis / warping_constant
    ) ** 0.25

    return {
        "shear_modulus": shear_modulus,
        "depth_of_web": depth_of_web,
        "depth_between_fillets": depth_between_fillets,
        "distance_from_major_axis_to_flange_centroid": distance_from_major_axis_to_flange_centroid,
        "distance_to_centroid_in_the_y_y_axis": distance_to_centroid_in_the_y_y_axis,
        "distance_to_centroid_in_the_z_z_axis": distance_to_centroid_in_the_z_z_axis,
        "cross_section_area_1": cross_section_area_1,
        "flange_area": flange_area,
        "web_area": web_area,
        "cross_section_area_2": cross_section_area_2,
        "cross_section_area": cross_section_area,
        "mass_per_metre_length": mass_per_metre_length,
        "web_slenderness": web_slenderness,
        "flange_slenderness": flange_slenderness,
        "end_clearance": end_clearance,
        "notch_width": notch_width,
        "notch_depth": notch_depth,
        "surface_area_per_metre": surface_area_per_metre,
        "surface_area_per_tonne": surface_area_per_tonne,
        "major_axis_rectangular_second_moment": major_axis_rectangular_second_moment,
        "major_axis_root_second_moment": major_axis_root_second_moment,
        "second_moment_of_area_about_major_axis": second_moment_of_area_about_major_axis,
        "second_moment_of_area_about_minor_axis": second_moment_of_area_about_minor_axis,
        "radius_of_gyration_about_major_axis": radius_of_gyration_about_major_axis,
        "radius_of_gyration_about_minor_axis": radius_of_gyration_about_minor_axis,
        "elastic_section_modulus_about_the_major_axis": elastic_section_modulus_about_the_major_axis,
        "elastic_section_modulus_about_the_minor_axis": elastic_section_modulus_about_the_minor_axis,
        "major_axis_rectangular_plastic_modulus": major_axis_rectangular_plastic_modulus,
        "major_axis_root_plastic_modulus": major_axis_root_plastic_modulus,
        "plastic_section_modulus_about_major_axis": plastic_section_modulus_about_major_axis,
        "plastic_section_modulus_about_minor_axis": plastic_section_modulus_about_minor_axis,
        "warping_constant": warping_constant,
        "torsion_geometric_coefficient": torsion_geometric_coefficient,
        "torsion_geometric_dimension": torsion_geometric_dimension,
        "torsional_constant": torsional_constant,
        "torsional_index": torsional_index,
        "buckling_geometric_coefficient": buckling_geometric_coefficient,
        "buckling_parameter": buckling_parameter,
    }
