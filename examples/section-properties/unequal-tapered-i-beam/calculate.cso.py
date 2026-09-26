"""Section properties based on Enji’s template, with documented corrections."""

import math
from typing import Annotated
from cso_python import (
    CalculationResults,
    calculation,
    section,
    symbol,
    document_section,
    text,
)


@calculation(
    id="unequal-tapered-i-beam",
    title="Unequal tapered I-beam",
    metadata={
        "referenceUrl": "https://www.enji.io/templates/basic-section-properties/unequal-tapered-i-beam",
        "corrections": ["Squared web parallel-axis distance", "Full symmetric taper y-axis inertia", "Linear bottom-taper width", "Governing extreme-fiber elastic modulus", "Translated section-origin coordinates"],
        "referenceExportSha256": "be2631bfc9179b680aa22ff7e58278743c959e8755cbecde5e41eb6c8ac7cfdf",
    },
)
@section(id="properties", title="Section properties", root=True)
def calculate(
    section_depth: Annotated[
        float, symbol(glyph="d_{t}", description="Section depth", unit="mm")
    ] = 100,
    web_thickness: Annotated[
        float, symbol(glyph="t_{w}", description="Web thickness", unit="mm")
    ] = 5,
    width_of_top_flange: Annotated[
        float, symbol(glyph="b_{f,top}", description="Width of top flange", unit="mm")
    ] = 50,
    outer_top_flange_thickness: Annotated[
        float,
        symbol(
            glyph='s_{f,"top"}', description="Outer top flange thickness", unit="mm"
        ),
    ] = 10,
    inner_top_flange_thickness: Annotated[
        float,
        symbol(
            glyph='n_{t,"top"}', description="Inner top flange thickness", unit="mm"
        ),
    ] = 15,
    width_of_bot_flange: Annotated[
        float, symbol(glyph="b_{f,bot}", description="Width of bot flange", unit="mm")
    ] = 30,
    outer_bot_flange_thickness: Annotated[
        float,
        symbol(
            glyph='s_{f,"bot"}', description="Outer bot flange thickness", unit="mm"
        ),
    ] = 5,
    inner_bot_flange_thickness: Annotated[
        float,
        symbol(
            glyph='n_{t,"bot"}', description="Inner bot flange thickness", unit="mm"
        ),
    ] = 10,
    lower_section_boundary: Annotated[
        float, symbol(glyph="Y_{0}", description="Lower section boundary", unit="mm")
    ] = 0,
) -> CalculationResults:
    text(
        id="reference-corrections",
        content="Based on the Enji template with corrections to the web parallel-axis term, symmetric taper inertia, bottom-taper width and governing elastic modulus. Y_0 translates absolute boundary and plastic-neutral-axis coordinates; centroid distances and section properties remain relative to the lower boundary. Independent polygon checks cover five plastic-neutral-axis regions. Human engineering approval is separate.",
    )
    outer_flange_to_flange_depth: Annotated[
        float,
        symbol(
            id="h_central",
            glyph="h_{central}",
            description="Outer flange to flange depth",
            unit="mm",
        ),
    ] = (
        section_depth - outer_bot_flange_thickness - outer_top_flange_thickness
    )

    web_depth: Annotated[
        float, symbol(id="L_t", glyph="L_{t}", description="Web depth", unit="mm")
    ] = (section_depth - inner_bot_flange_thickness - inner_top_flange_thickness)

    tapered_top_flange_segment_horizontal_length: Annotated[
        float,
        symbol(
            id="a_h_top_2",
            glyph="a_{h,top}",
            description="Tapered top flange segment horizontal length",
            unit="mm",
        ),
    ] = 0.5 * (width_of_top_flange - web_thickness)

    tapered_bottom_flange_segment_horizontal_length: Annotated[
        float,
        symbol(
            id="a_h_bot",
            glyph="a_{h,bot}",
            description="Tapered bottom flange segment horizontal length",
            unit="mm",
        ),
    ] = 0.5 * (width_of_bot_flange - web_thickness)

    tapered_top_flange_segment_vertical_length: Annotated[
        float,
        symbol(
            id="a_v_top",
            glyph="a_{v,top}",
            description="Tapered top flange segment vertical length",
            unit="mm",
        ),
    ] = (
        inner_top_flange_thickness - outer_top_flange_thickness
    )

    tapered_bot_flange_segment_vertical_length: Annotated[
        float,
        symbol(
            id="a_v_bot",
            glyph="a_{v,bot}",
            description="Tapered bot flange segment vertical length",
            unit="mm",
        ),
    ] = (
        inner_bot_flange_thickness - outer_bot_flange_thickness
    )

    top_flange_area: Annotated[
        float,
        symbol(
            id="A_top_flange",
            glyph="A_{top,flange}",
            description="Top flange area",
            unit="mm^2",
        ),
    ] = (
        width_of_top_flange * outer_top_flange_thickness
    )

    top_trapezoid_area: Annotated[
        float,
        symbol(
            id="A_top_trapz",
            glyph="A_{top,trapz}",
            description="Top trapezoid area",
            unit="mm^2",
        ),
    ] = (
        0.5
        * (width_of_top_flange + web_thickness)
        * tapered_top_flange_segment_vertical_length
    )

    web_area: Annotated[
        float, symbol(id="A_web", glyph="A_{web}", description="Web area", unit="mm^2")
    ] = (web_thickness * web_depth)

    bottom_trapezoid_area: Annotated[
        float,
        symbol(
            id="A_bot_trapz",
            glyph="A_{bot,trapz}",
            description="Bottom trapezoid area",
            unit="mm^2",
        ),
    ] = (
        0.5
        * (width_of_bot_flange + web_thickness)
        * tapered_bot_flange_segment_vertical_length
    )

    bottom_flange_area: Annotated[
        float,
        symbol(
            id="A_bot_flange",
            glyph="A_{bot,flange}",
            description="Bottom flange area",
            unit="mm^2",
        ),
    ] = (
        width_of_bot_flange * outer_bot_flange_thickness
    )

    total_area_of_the_section: Annotated[
        float,
        symbol(
            id="A_t",
            glyph="A_{t}",
            description="Total area of the section",
            unit="mm^2",
        ),
    ] = (
        bottom_flange_area
        + bottom_trapezoid_area
        + web_area
        + top_trapezoid_area
        + top_flange_area
    )

    perimeter: Annotated[
        float, symbol(id="P_t", glyph="P_{t}", description="Perimeter", unit="mm")
    ] = (
        width_of_bot_flange
        + width_of_top_flange
        + 2
        * (
            outer_bot_flange_thickness
            + outer_top_flange_thickness
            + web_depth
            + math.sqrt(
                tapered_bot_flange_segment_vertical_length**2
                + tapered_bottom_flange_segment_horizontal_length**2
            )
            + math.sqrt(
                tapered_top_flange_segment_vertical_length**2
                + tapered_top_flange_segment_horizontal_length**2
            )
        )
    )

    distance_to_centroid_x_axis: Annotated[
        float,
        symbol(
            id="C_x",
            glyph="C_{x}",
            description="Distance to centroid (x-axis)",
            unit="mm",
        ),
    ] = (
        max(width_of_bot_flange, width_of_top_flange) / 2
    )

    top_flange_centroid: Annotated[
        float,
        symbol(
            id="y_top_flange",
            glyph="y_{top,flange}",
            description="Top flange centroid distance from the lower section boundary",
            unit="mm",
        ),
    ] = (
        section_depth - 0.5 * outer_top_flange_thickness
    )

    top_trapezoid_centroid: Annotated[
        float,
        symbol(
            id="y_top_trapz",
            glyph="y_{top,trapz}",
            description="Top trapezoid centroid distance from the lower section boundary",
            unit="mm",
        ),
    ] = (
        section_depth
        - outer_top_flange_thickness
        - tapered_top_flange_segment_vertical_length
        / 3
        * (
            (2 * web_thickness + width_of_top_flange)
            / (web_thickness + width_of_top_flange)
        )
    )

    web_centroid: Annotated[
        float,
        symbol(id="y_web", glyph="y_{web}", description="Web centroid distance from the lower section boundary", unit="mm"),
    ] = (
        section_depth - inner_top_flange_thickness - 0.5 * web_depth
    )

    bottom_trapezoid_centroid: Annotated[
        float,
        symbol(
            id="y_bot_trapz",
            glyph="y_{bot,trapz}",
            description="Bottom trapezoid centroid distance from the lower section boundary",
            unit="mm",
        ),
    ] = outer_bot_flange_thickness + tapered_bot_flange_segment_vertical_length * (
        2 * web_thickness + width_of_bot_flange
    ) / (
        web_thickness + width_of_bot_flange
    ) * (
        1 / 3
    )

    bottom_flange_centroid: Annotated[
        float,
        symbol(
            id="y_bot_flange",
            glyph="y_{bot,flange}",
            description="Bottom flange centroid distance from the lower section boundary",
            unit="mm",
        ),
    ] = (
        0.5 * outer_bot_flange_thickness
    )

    distance_to_centroid_y_axis_from_the_bottom_of_the_section: Annotated[
        float,
        symbol(
            id="C_y_2",
            glyph="C_{y}",
            description="Distance to centroid (y-axis) from the bottom of the section",
            unit="mm",
        ),
    ] = (
        bottom_flange_area * bottom_flange_centroid
        + bottom_trapezoid_area * bottom_trapezoid_centroid
        + web_area * web_centroid
        + top_trapezoid_area * top_trapezoid_centroid
        + top_flange_area * top_flange_centroid
    ) / total_area_of_the_section

    second_moment_of_area_about_x_axis_for_the_top_flange: Annotated[
        float,
        symbol(
            id="I_xx_top_flange",
            glyph="I_{xx,top,flange}",
            description="Second moment of area about x axis for the top flange",
            unit="mm^4",
        ),
    ] = (
        top_flange_area * outer_top_flange_thickness**2 / 12
        + top_flange_area
        * (
            top_flange_centroid
            - distance_to_centroid_y_axis_from_the_bottom_of_the_section
        )
        ** 2
    )

    second_moment_of_area_about_the_x_axis_for_the_top_tapered_sections: Annotated[
        float,
        symbol(
            id="I_xx_top_trapz",
            glyph="I_{xx,top,trapz}",
            description="Second moment of area about the x-axis for the top tapered sections",
            unit="mm^4",
        ),
    ] = (
        tapered_top_flange_segment_vertical_length**3
        * (
            web_thickness**2
            + 4 * web_thickness * width_of_top_flange
            + width_of_top_flange**2
        )
        / (36 * (web_thickness + width_of_top_flange))
        + top_trapezoid_area
        * (
            top_trapezoid_centroid
            - distance_to_centroid_y_axis_from_the_bottom_of_the_section
        )
        ** 2
    )

    second_moment_of_area_about_x_axis_for_the_web: Annotated[
        float,
        symbol(
            id="I_xx_web",
            glyph="I_{xx,web}",
            description="Second moment of area about x axis for the web",
            unit="mm^4",
        ),
    ] = web_area * web_depth**2 / 12 + web_area * (
        web_centroid - distance_to_centroid_y_axis_from_the_bottom_of_the_section
    ) ** 2

    second_moment_of_area_about_the_x_axis_for_the_bottom_tapered_sections: Annotated[
        float,
        symbol(
            id="I_xx_bot_trapz",
            glyph="I_{xx,bot,trapz}",
            description="Second moment of area about the x-axis for the bottom tapered sections",
            unit="mm^4",
        ),
    ] = (
        tapered_bot_flange_segment_vertical_length**3
        * (
            web_thickness**2
            + 4 * web_thickness * width_of_bot_flange
            + width_of_bot_flange**2
        )
        / (36 * (web_thickness + width_of_bot_flange))
        + bottom_trapezoid_area
        * (
            bottom_trapezoid_centroid
            - distance_to_centroid_y_axis_from_the_bottom_of_the_section
        )
        ** 2
    )

    second_moment_of_area_about_x_axis_for_the_bot_flange: Annotated[
        float,
        symbol(
            id="I_xx_bot_flange",
            glyph="I_{xx,bot,flange}",
            description="Second moment of area about x-axis for the bot flange",
            unit="mm^4",
        ),
    ] = (
        bottom_flange_area * outer_bot_flange_thickness**2 / 12
        + bottom_flange_area
        * (
            bottom_flange_centroid
            - distance_to_centroid_y_axis_from_the_bottom_of_the_section
        )
        ** 2
    )

    second_moment_of_area_about_x_axis: Annotated[
        float,
        symbol(
            id="I_x_x",
            glyph="I_{xx}",
            description="Second moment of area about x-axis",
            unit="mm^4",
        ),
    ] = (
        second_moment_of_area_about_x_axis_for_the_top_flange
        + second_moment_of_area_about_x_axis_for_the_bot_flange
        + second_moment_of_area_about_x_axis_for_the_web
        + second_moment_of_area_about_the_x_axis_for_the_top_tapered_sections
        + second_moment_of_area_about_the_x_axis_for_the_bottom_tapered_sections
    )

    second_moment_of_area_about_the_x1_axis: Annotated[
        float,
        symbol(
            id="I_xx_1",
            glyph='I_{"xx",1}',
            description="Second moment of area about the x1-axis",
            unit="mm^4",
        ),
    ] = (
        second_moment_of_area_about_x_axis
        + total_area_of_the_section
        * distance_to_centroid_y_axis_from_the_bottom_of_the_section**2
    )

    second_moment_of_area_about_the_y_axis_for_the_major_flange: Annotated[
        float,
        symbol(
            id="I_yy_top_flange",
            glyph="I_{yy,top,flange}",
            description="Second moment of area about the y-axis for the major flange",
            unit="mm^4",
        ),
    ] = (
        1 / 12 * outer_top_flange_thickness * width_of_top_flange**3
    )

    second_moment_of_area_about_the_y_axis_for_the_minor_flange: Annotated[
        float,
        symbol(
            id="I_yy_bot_flange",
            glyph="I_{yy,bot,flange}",
            description="Second moment of area about the y-axis for the minor flange",
            unit="mm^4",
        ),
    ] = (
        1 / 12 * outer_bot_flange_thickness * width_of_bot_flange**3
    )

    second_moment_if_area_about_the_y_axis_for_the_web: Annotated[
        float,
        symbol(
            id="I_yy_web",
            glyph="I_{yy,web}",
            description="Second moment if area about the y-axis for the web",
            unit="mm^4",
        ),
    ] = (
        1 / 12 * web_depth * web_thickness**3
    )

    second_moment_of_area_about_the_y_axis_for_the_top_tapered_section: Annotated[
        float,
        symbol(
            id="I_yy_top_trapz",
            glyph="I_{yy,top,trapz}",
            description="Second moment of area about the y-axis for the top tapered section",
            unit="mm^4",
        ),
    ] = (
        2 * (1
        / 36
        * (inner_top_flange_thickness - outer_top_flange_thickness)
        * tapered_top_flange_segment_horizontal_length**3
        + tapered_top_flange_segment_horizontal_length
        * (inner_top_flange_thickness - outer_top_flange_thickness)
        / 2
        * (web_thickness / 2 + tapered_top_flange_segment_horizontal_length / 3) ** 2) + (inner_top_flange_thickness - outer_top_flange_thickness) * web_thickness**3 / 12
    )

    second_moment_of_area_about_the_y_axis_for_the_bottom_tapered_section: Annotated[
        float,
        symbol(
            id="I_yy_bot_trapz",
            glyph="I_{yy,bot,trapz}",
            description="Second moment of area about the y-axis for the bottom tapered section",
            unit="mm^4",
        ),
    ] = (
        2 * (1
        / 36
        * (inner_bot_flange_thickness - outer_bot_flange_thickness)
        * tapered_bottom_flange_segment_horizontal_length**3
        + tapered_bottom_flange_segment_horizontal_length
        * (inner_bot_flange_thickness - outer_bot_flange_thickness)
        / 2
        * (web_thickness / 2 + tapered_bottom_flange_segment_horizontal_length / 3) ** 2) + (inner_bot_flange_thickness - outer_bot_flange_thickness) * web_thickness**3 / 12
    )

    second_moment_of_area_about_y_axis: Annotated[
        float,
        symbol(
            id="I_y_y",
            glyph="I_{yy}",
            description="Second moment of area about y-axis",
            unit="mm^4",
        ),
    ] = (
        second_moment_of_area_about_the_y_axis_for_the_major_flange
        + second_moment_of_area_about_the_y_axis_for_the_minor_flange
        + second_moment_if_area_about_the_y_axis_for_the_web
        + second_moment_of_area_about_the_y_axis_for_the_top_tapered_section
        + second_moment_of_area_about_the_y_axis_for_the_bottom_tapered_section
    )

    second_moment_of_area_about_the_y1_axis: Annotated[
        float,
        symbol(
            id="I_yy_1",
            glyph="I_{yy,1}",
            description="Second moment of area about the y1-axis",
            unit="mm^4",
        ),
    ] = (
        second_moment_of_area_about_y_axis
        + total_area_of_the_section * distance_to_centroid_x_axis**2
    )

    polar_second_moment_of_area_about_the_z_axis: Annotated[
        float,
        symbol(
            id="J_z_2",
            glyph="J_{z}",
            description="Polar second moment of area about the z-axis",
            unit="mm^4",
        ),
    ] = (
        second_moment_of_area_about_x_axis + second_moment_of_area_about_y_axis
    )

    polar_second_moment_of_area_about_the_z1_axis: Annotated[
        float,
        symbol(
            id="J_z_1",
            glyph="J_{z_{1}}",
            description="Polar second moment of area about the z1-axis",
            unit="mm^4",
        ),
    ] = (
        second_moment_of_area_about_the_x1_axis
        + second_moment_of_area_about_the_y1_axis
    )

    radius_of_gyration_about_x_axis: Annotated[
        float,
        symbol(
            id="K_x",
            glyph="K_{x}",
            description="Radius of gyration about x-axis",
            unit="mm",
        ),
    ] = math.sqrt(second_moment_of_area_about_x_axis / total_area_of_the_section)

    radius_of_gyration_about_y_axis: Annotated[
        float,
        symbol(
            id="K_y",
            glyph="K_{y}",
            description="Radius of gyration about y-axis",
            unit="mm",
        ),
    ] = math.sqrt(second_moment_of_area_about_y_axis / total_area_of_the_section)

    radius_of_gyration_about_the_z_axis: Annotated[
        float,
        symbol(
            id="K_z",
            glyph="K_{z}",
            description="Radius of gyration about the z-axis",
            unit="mm",
        ),
    ] = math.sqrt(
        radius_of_gyration_about_x_axis**2 + radius_of_gyration_about_y_axis**2
    )

    radius_of_gyration_about_the_x1_axis: Annotated[
        float,
        symbol(
            id="K_x_1",
            glyph="K_{x_{1}}",
            description="Radius of gyration about the x1-axis",
            unit="mm",
        ),
    ] = math.sqrt(second_moment_of_area_about_the_x1_axis / total_area_of_the_section)

    radius_of_gyration_about_the_y1_axis: Annotated[
        float,
        symbol(
            id="K_y_1",
            glyph="K_{y_{1}}",
            description="Radius of gyration about the y1-axis",
            unit="mm",
        ),
    ] = math.sqrt(second_moment_of_area_about_the_y1_axis / total_area_of_the_section)

    radius_of_gyration_about_the_z1_axis: Annotated[
        float,
        symbol(
            id="K_z_1",
            glyph="K_{z_{1}}",
            description="Radius of gyration about the z1-axis",
            unit="mm",
        ),
    ] = math.sqrt(
        radius_of_gyration_about_the_x1_axis**2
        + radius_of_gyration_about_the_y1_axis**2
    )

    elastic_section_modulus_about_x_axis: Annotated[
        float,
        symbol(
            id="S_x",
            glyph="S_{x}",
            description="Governing elastic section modulus about x-axis",
            unit="mm^3",
        ),
    ] = (
        second_moment_of_area_about_x_axis
        / max(
            distance_to_centroid_y_axis_from_the_bottom_of_the_section,
            section_depth - distance_to_centroid_y_axis_from_the_bottom_of_the_section,
        )
    )

    elastic_section_modulus_about_y_axis: Annotated[
        float,
        symbol(
            id="S_y",
            glyph="S_{y}",
            description="Elastic section modulus about y-axis",
            unit="mm^3",
        ),
    ] = (
        second_moment_of_area_about_y_axis / distance_to_centroid_x_axis
    )

    with document_section(id="plastic-x", title="Plastic section modulus about x-axis"):
        half_of_section_area: Annotated[
            float,
            symbol(
                id="A_half",
                glyph="A_{half}",
                description="Half of section area",
                unit="mm^2",
            ),
        ] = (
            total_area_of_the_section / 2
        )

        lower_trapezoid_flange_boundary: Annotated[
            float,
            symbol(
                id="Y_1",
                glyph="Y_{1}",
                description="Lower trapezoid-flange boundary",
                unit="mm",
            ),
        ] = lower_section_boundary + (outer_bot_flange_thickness)

        lower_trapezoid_web_boundary: Annotated[
            float,
            symbol(
                id="Y_2",
                glyph="Y_{2}",
                description="Lower trapezoid-web boundary",
                unit="mm",
            ),
        ] = lower_section_boundary + (inner_bot_flange_thickness)

        upper_trapezoid_web_boundary: Annotated[
            float,
            symbol(
                id="Y_3",
                glyph="Y_{3}",
                description="Upper trapezoid-web boundary",
                unit="mm",
            ),
        ] = (
            lower_section_boundary + (section_depth - inner_top_flange_thickness)
        )

        upper_trapezoid_flange_boundary: Annotated[
            float,
            symbol(
                id="Y_4",
                glyph="Y_{4}",
                description="Upper trapezoid-flange boundary",
                unit="mm",
            ),
        ] = (
            lower_section_boundary + (section_depth - outer_top_flange_thickness)
        )

        upper_section_boundary: Annotated[
            float,
            symbol(
                id="Y_5", glyph="Y_{5}", description="Upper section boundary", unit="mm"
            ),
        ] = lower_section_boundary + (section_depth)

        area_boundary_bottom_flange: Annotated[
            float,
            symbol(
                id="A_L1",
                glyph="A_{L1}",
                description="Area boundary bottom flange",
                unit="mm^2",
            ),
        ] = bottom_flange_area

        area_boundary_bottom_trapezoid: Annotated[
            float,
            symbol(
                id="A_L2",
                glyph="A_{L2}",
                description="Area boundary bottom trapezoid",
                unit="mm^2",
            ),
        ] = (
            area_boundary_bottom_flange + bottom_trapezoid_area
        )

        area_boundary_web: Annotated[
            float,
            symbol(
                id="A_L3", glyph="A_{L3}", description="Area boundary web", unit="mm^2"
            ),
        ] = (
            area_boundary_bottom_trapezoid + web_area
        )

        area_boundary_top_trapezoid: Annotated[
            float,
            symbol(
                id="A_L4",
                glyph="A_{L4}",
                description="Area boundary top trapezoid",
                unit="mm^2",
            ),
        ] = (
            area_boundary_web + top_trapezoid_area
        )

        area_boundary_top_flange: Annotated[
            float,
            symbol(
                id="A_L5",
                glyph="A_{L5}",
                description="Area boundary top flange",
                unit="mm^2",
            ),
        ] = (
            area_boundary_top_trapezoid + top_flange_area
        )

        bottom_trapezoid_gradient: Annotated[
            float,
            symbol(
                id="k_bot",
                glyph="k_{bot}",
                description="Bottom trapezoid gradient",
                unit="rad",
            ),
        ] = (
            web_thickness - width_of_bot_flange
        ) / tapered_bot_flange_segment_vertical_length

        top_trapezoid_gradient: Annotated[
            float,
            symbol(
                id="k_top",
                glyph="k_{top}",
                description="Top trapezoid gradient",
                unit="",
            ),
        ] = (
            width_of_top_flange - web_thickness
        ) / tapered_top_flange_segment_vertical_length

        bottom_quadratic_discriminant: Annotated[
            float,
            symbol(
                id="Delta_bot",
                glyph="Δ_{bot}",
                description="Bottom quadratic discriminant",
                unit="mm^2",
            ),
        ] = width_of_bot_flange**2 + 2 * bottom_trapezoid_gradient * (
            half_of_section_area - area_boundary_bottom_flange
        )

        top_quadratic_discriminant: Annotated[
            float,
            symbol(
                id="Delta_top",
                glyph="Δ_{top}",
                description="Top quadratic discriminant",
                unit="mm^2",
            ),
        ] = web_thickness**2 + 2 * top_trapezoid_gradient * (
            half_of_section_area - area_boundary_web
        )

        candidate_for_bottom_flange: Annotated[
            float,
            symbol(
                id="y_try_bot_flange",
                glyph="y_{try,bot,flange}",
                description="Candidate for bottom flange",
                unit="mm",
            ),
        ] = (
            lower_section_boundary + (half_of_section_area / width_of_bot_flange)
        )

        candidate_for_bottom_trapezoid: Annotated[
            float,
            symbol(
                id="y_try_bot_trapz",
                glyph="y_{try,bot,trapz}",
                description="Candidate for bottom trapezoid",
                unit="mm",
            ),
        ] = (
            lower_trapezoid_flange_boundary
            + (-width_of_bot_flange + math.sqrt(bottom_quadratic_discriminant))
            / bottom_trapezoid_gradient
            if bottom_quadratic_discriminant >= 0
            else lower_section_boundary - 1
        )

        candidate_for_web: Annotated[
            float,
            symbol(
                id="y_try_web",
                glyph="y_{try,web}",
                description="Candidate for web",
                unit="mm",
            ),
        ] = (
            lower_trapezoid_web_boundary
            + (half_of_section_area - area_boundary_bottom_trapezoid) / web_thickness
        )

        candidate_for_top_trapezoid: Annotated[
            float,
            symbol(
                id="Y_try_top_trapz",
                glyph="Y_{try,top,trapz}",
                description="Candidate for top trapezoid",
                unit="mm",
            ),
        ] = (
            upper_trapezoid_web_boundary
            + (-web_thickness + math.sqrt(top_quadratic_discriminant))
            / top_trapezoid_gradient
            if top_quadratic_discriminant >= 0
            else lower_section_boundary - 1
        )

        candidate_for_top_flange: Annotated[
            float,
            symbol(
                id="y_try_top_flange",
                glyph="y_{try,top,flange}",
                description="Candidate for top flange",
                unit="mm",
            ),
        ] = (
            upper_trapezoid_flange_boundary
            + (half_of_section_area - area_boundary_top_trapezoid) / width_of_top_flange
        )

        plastic_neutral_axis_location: Annotated[
            float,
            symbol(
                id="y_p_4",
                glyph="y_{p}",
                description="Plastic neutral axis location",
                unit="mm",
            ),
        ] = (
            candidate_for_bottom_flange
            if half_of_section_area <= area_boundary_bottom_flange
            else (
                candidate_for_bottom_trapezoid
                if half_of_section_area <= area_boundary_bottom_trapezoid
                else (
                    candidate_for_web
                    if half_of_section_area <= area_boundary_web
                    else (
                        candidate_for_top_trapezoid
                        if half_of_section_area <= area_boundary_top_trapezoid
                        else candidate_for_top_flange
                    )
                )
            )
        )

        distance_to_plastic_neutral_axis_from_lower_boundary: Annotated[
            float,
            symbol(
                glyph="y_{p,local}",
                description="Plastic neutral axis distance from the lower section boundary",
                unit="mm",
            ),
        ] = plastic_neutral_axis_location - lower_section_boundary

        bottom_flange_term: Annotated[
            float,
            symbol(
                id="Z_bot_flange",
                glyph="Z_{bot,flange}",
                description="Bottom flange term",
                unit="mm^3",
            ),
        ] = (
            width_of_bot_flange
            / 2
            * (
                distance_to_plastic_neutral_axis_from_lower_boundary**2
                + (outer_bot_flange_thickness - distance_to_plastic_neutral_axis_from_lower_boundary) ** 2
            )
            if distance_to_plastic_neutral_axis_from_lower_boundary < outer_bot_flange_thickness
            else bottom_flange_area
            * (distance_to_plastic_neutral_axis_from_lower_boundary - outer_bot_flange_thickness / 2)
        )

        the_width_at_the_pna_level_when_inside_the_bottom_trapezoid: Annotated[
            float,
            symbol(
                id="w_pna_bot_trapz",
                glyph="w_{pna,bot,trapz}",
                description="The width at the PNA level when inside the bottom trapezoid",
                unit="mm",
            ),
        ] = width_of_bot_flange + (distance_to_plastic_neutral_axis_from_lower_boundary - outer_bot_flange_thickness) * bottom_trapezoid_gradient

        area_bottom_wedge: Annotated[
            float,
            symbol(
                id="A_bw_bot_trapz",
                glyph="A_{bw,bot,trapz}",
                description="Area bottom wedge",
                unit="",
            ),
        ] = (
            (
                width_of_bot_flange
                + the_width_at_the_pna_level_when_inside_the_bottom_trapezoid
            )
            / 2
            * (distance_to_plastic_neutral_axis_from_lower_boundary - outer_bot_flange_thickness)
        )

        lever_arm_bottom_wedge: Annotated[
            float,
            symbol(
                id="y_bw_bot_trapz",
                glyph="y_{bw,bot,trapz}",
                description="Lever arm bottom wedge",
                unit="mm",
            ),
        ] = (
            (distance_to_plastic_neutral_axis_from_lower_boundary - outer_bot_flange_thickness)
            / 3
            * (
                (
                    the_width_at_the_pna_level_when_inside_the_bottom_trapezoid
                    + 2 * width_of_bot_flange
                )
                / (
                    the_width_at_the_pna_level_when_inside_the_bottom_trapezoid
                    + width_of_bot_flange
                )
            )
        )

        bottom_wedge_term: Annotated[
            float,
            symbol(
                id="Z_bw_bot_trapz",
                glyph="Z_{bw,bot,trapz}",
                description="Bottom wedge term",
                unit="mm^3",
            ),
        ] = (
            area_bottom_wedge * lever_arm_bottom_wedge
        )

        area_top_wedge: Annotated[
            float,
            symbol(
                id="A_tw_bot_trapz",
                glyph="A_{tw,bot,trapz}",
                description="Area top wedge",
                unit="mm^2",
            ),
        ] = (
            (
                the_width_at_the_pna_level_when_inside_the_bottom_trapezoid
                + web_thickness
            )
            / 2
            * (inner_bot_flange_thickness - distance_to_plastic_neutral_axis_from_lower_boundary)
        )

        lever_arm_top_wedge: Annotated[
            float,
            symbol(
                id="y_tw_bot_trapz",
                glyph="y_{tw,bot,trapz}",
                description="Lever arm top wedge",
                unit="mm",
            ),
        ] = (
            (inner_bot_flange_thickness - distance_to_plastic_neutral_axis_from_lower_boundary)
            / 3
            * (
                (
                    the_width_at_the_pna_level_when_inside_the_bottom_trapezoid
                    + 2 * web_thickness
                )
                / (
                    the_width_at_the_pna_level_when_inside_the_bottom_trapezoid
                    + web_thickness
                )
            )
        )

        top_wedge_term: Annotated[
            float,
            symbol(
                id="Z_tw_bot_trapz",
                glyph="Z_{tw,bot,trapz}",
                description="Top wedge term",
                unit="mm^3",
            ),
        ] = (
            area_top_wedge * lever_arm_top_wedge
        )

        bottom_trapezoid_term: Annotated[
            float,
            symbol(
                id="Z_bot_trapz",
                glyph="Z_{bot,trapz}",
                description="Bottom trapezoid term",
                unit="mm^3",
            ),
        ] = (
            bottom_trapezoid_area
            * (distance_to_plastic_neutral_axis_from_lower_boundary - bottom_trapezoid_centroid)
            if distance_to_plastic_neutral_axis_from_lower_boundary > inner_bot_flange_thickness
            else (
                bottom_trapezoid_area
                * (bottom_trapezoid_centroid - distance_to_plastic_neutral_axis_from_lower_boundary)
                if distance_to_plastic_neutral_axis_from_lower_boundary < outer_bot_flange_thickness
                else bottom_wedge_term + top_wedge_term
            )
        )

        web_term: Annotated[
            float,
            symbol(
                id="Z_web_2",
                glyph="Z_{web}",
                description="Web term",
                unit="mm^3",
                notation_scope="x-axis",
            ),
        ] = (
            web_area * (distance_to_plastic_neutral_axis_from_lower_boundary - web_centroid)
            if distance_to_plastic_neutral_axis_from_lower_boundary
            > section_depth - inner_top_flange_thickness
            else (
                web_area * (web_centroid - distance_to_plastic_neutral_axis_from_lower_boundary)
                if distance_to_plastic_neutral_axis_from_lower_boundary < inner_bot_flange_thickness
                else web_thickness
                / 2
                * (
                    (distance_to_plastic_neutral_axis_from_lower_boundary - inner_bot_flange_thickness) ** 2
                    + (
                        section_depth
                        - inner_top_flange_thickness
                        - distance_to_plastic_neutral_axis_from_lower_boundary
                    )
                    ** 2
                )
            )
        )

        the_width_at_the_pna_level_when_inside_the_top_trapezoid: Annotated[
            float,
            symbol(
                id="w_pna_top_trapz",
                glyph="w_{pna,top,trapz}",
                description="The width at the PNA level when inside the top trapezoid",
                unit="mm",
            ),
        ] = web_thickness + (width_of_top_flange - web_thickness) * (
            (
                distance_to_plastic_neutral_axis_from_lower_boundary
                - (section_depth - inner_top_flange_thickness)
            )
            / tapered_top_flange_segment_vertical_length
        )

        area_bottom_wedge_component_a_bw_top_trapz: Annotated[
            float,
            symbol(
                id="A_bw_top_trapz",
                glyph="A_{bw,top,trapz}",
                description="Area bottom wedge",
                unit="mm^2",
            ),
        ] = (
            (web_thickness + the_width_at_the_pna_level_when_inside_the_top_trapezoid)
            / 2
            * (
                distance_to_plastic_neutral_axis_from_lower_boundary
                - (section_depth - inner_top_flange_thickness)
            )
        )

        lever_arm_bottom_wedge_component_y_bw_top_trapz: Annotated[
            float,
            symbol(
                id="y_bw_top_trapz",
                glyph="y_{bw,top,trapz}",
                description="Lever arm bottom wedge",
                unit="mm",
            ),
        ] = (
            (
                distance_to_plastic_neutral_axis_from_lower_boundary
                - (section_depth - inner_top_flange_thickness)
            )
            / 3
            * (
                (
                    the_width_at_the_pna_level_when_inside_the_top_trapezoid
                    + 2 * web_thickness
                )
                / (
                    the_width_at_the_pna_level_when_inside_the_top_trapezoid
                    + web_thickness
                )
            )
        )

        bottom_wedge_term_component_z_bw_top_trapz: Annotated[
            float,
            symbol(
                id="Z_bw_top_trapz",
                glyph="Z_{bw,top,trapz}",
                description="Bottom wedge term",
                unit="mm^3",
            ),
        ] = (
            area_bottom_wedge_component_a_bw_top_trapz
            * lever_arm_bottom_wedge_component_y_bw_top_trapz
        )

        area_top_wedge_component_a_tw_top_trapz: Annotated[
            float,
            symbol(
                id="A_tw_top_trapz",
                glyph="A_{tw,top,trapz}",
                description="Area top wedge",
                unit="mm^2",
            ),
        ] = (
            (
                the_width_at_the_pna_level_when_inside_the_top_trapezoid
                + width_of_top_flange
            )
            / 2
            * (
                section_depth
                - outer_top_flange_thickness
                - distance_to_plastic_neutral_axis_from_lower_boundary
            )
        )

        lever_arm_top_wedge_component_y_tw_top_trapz: Annotated[
            float,
            symbol(
                id="y_tw_top_trapz",
                glyph="y_{tw,top,trapz}",
                description="Lever arm top wedge",
                unit="mm",
            ),
        ] = (
            (section_depth - outer_top_flange_thickness - distance_to_plastic_neutral_axis_from_lower_boundary)
            / 3
            * (
                (
                    the_width_at_the_pna_level_when_inside_the_top_trapezoid
                    + 2 * width_of_top_flange
                )
                / (
                    the_width_at_the_pna_level_when_inside_the_top_trapezoid
                    + width_of_top_flange
                )
            )
        )

        top_wedge_term_component_z_tw_top_trapz: Annotated[
            float,
            symbol(
                id="Z_tw_top_trapz",
                glyph="Z_{tw,top,trapz}",
                description="Top wedge term",
                unit="mm^3",
            ),
        ] = (
            area_top_wedge_component_a_tw_top_trapz
            * lever_arm_top_wedge_component_y_tw_top_trapz
        )

        top_trapezoid_term: Annotated[
            float,
            symbol(
                id="Z_top_trapz",
                glyph="Z_{top,trapz}",
                description="Top trapezoid term",
                unit="mm^3",
            ),
        ] = (
            top_trapezoid_area
            * (distance_to_plastic_neutral_axis_from_lower_boundary - top_trapezoid_centroid)
            if distance_to_plastic_neutral_axis_from_lower_boundary
            > section_depth - outer_top_flange_thickness
            else (
                top_trapezoid_area
                * (top_trapezoid_centroid - distance_to_plastic_neutral_axis_from_lower_boundary)
                if distance_to_plastic_neutral_axis_from_lower_boundary
                < section_depth - inner_top_flange_thickness
                else bottom_wedge_term_component_z_bw_top_trapz
                + top_wedge_term_component_z_tw_top_trapz
            )
        )

        top_flange_term: Annotated[
            float,
            symbol(
                id="Z_top_flange",
                glyph="Z_{top,flange}",
                description="Top flange term",
                unit="mm^3",
            ),
        ] = (
            top_flange_area * (top_flange_centroid - distance_to_plastic_neutral_axis_from_lower_boundary)
            if distance_to_plastic_neutral_axis_from_lower_boundary
            < section_depth - outer_top_flange_thickness
            else width_of_top_flange
            / 2
            * (
                (section_depth - distance_to_plastic_neutral_axis_from_lower_boundary) ** 2
                + (
                    outer_top_flange_thickness
                    - (section_depth - distance_to_plastic_neutral_axis_from_lower_boundary)
                )
                ** 2
            )
        )

        plastic_section_modulus_about_x_axis: Annotated[
            float,
            symbol(
                id="Z_x",
                glyph="Z_{x}",
                description="Plastic section modulus about x-axis",
                unit="mm^3",
            ),
        ] = (
            bottom_flange_term
            + bottom_trapezoid_term
            + web_term
            + top_trapezoid_term
            + top_flange_term
        )

    with document_section(id="plastic-y", title="Plastic section modulus about y-axis"):
        # This reference reuses Z_web in a distinct axis context.
        flanges_contribution_term: Annotated[
            float,
            symbol(
                id="Z_flanges",
                glyph="Z_{flanges}",
                description="Flanges contribution term",
                unit="mm^3",
            ),
        ] = (
            outer_top_flange_thickness * width_of_top_flange**2 / 4
            + outer_bot_flange_thickness * width_of_bot_flange**2 / 4
        )

        central_web_term: Annotated[
            float,
            symbol(
                id="Z_web",
                glyph="Z_{web}",
                description="Central web term",
                unit="mm^3",
                notation_scope="y-axis",
            ),
        ] = (
            outer_flange_to_flange_depth * web_thickness**2 / 4
        )

        top_wings_term: Annotated[
            float,
            symbol(
                id="Z_wings_top",
                glyph="Z_{wings,top}",
                description="Top wings term",
                unit="mm^3",
            ),
        ] = (
            2
            * (
                0.5
                * tapered_top_flange_segment_vertical_length
                * tapered_top_flange_segment_horizontal_length
            )
            * (web_thickness / 2 + tapered_top_flange_segment_horizontal_length / 3)
        )

        bottom_wings_term: Annotated[
            float,
            symbol(
                id="Z_wings_bot",
                glyph="Z_{wings,bot}",
                description="Bottom wings term",
                unit="mm^3",
            ),
        ] = (
            2
            * (
                0.5
                * tapered_bottom_flange_segment_horizontal_length
                * tapered_bot_flange_segment_vertical_length
            )
            * (web_thickness / 2 + tapered_bottom_flange_segment_horizontal_length / 3)
        )

        plastic_section_mosulus_about_y_axis: Annotated[
            float,
            symbol(
                id="Z_y",
                glyph="Z_{y}",
                description="Plastic section mosulus about y-axis",
                unit="mm^3",
            ),
        ] = (
            flanges_contribution_term
            + central_web_term
            + top_wings_term
            + bottom_wings_term
        )

    return {
        "outer_flange_to_flange_depth": outer_flange_to_flange_depth,
        "web_depth": web_depth,
        "tapered_top_flange_segment_horizontal_length": tapered_top_flange_segment_horizontal_length,
        "tapered_bottom_flange_segment_horizontal_length": tapered_bottom_flange_segment_horizontal_length,
        "tapered_top_flange_segment_vertical_length": tapered_top_flange_segment_vertical_length,
        "tapered_bot_flange_segment_vertical_length": tapered_bot_flange_segment_vertical_length,
        "top_flange_area": top_flange_area,
        "top_trapezoid_area": top_trapezoid_area,
        "web_area": web_area,
        "bottom_trapezoid_area": bottom_trapezoid_area,
        "bottom_flange_area": bottom_flange_area,
        "total_area_of_the_section": total_area_of_the_section,
        "perimeter": perimeter,
        "distance_to_centroid_x_axis": distance_to_centroid_x_axis,
        "top_flange_centroid": top_flange_centroid,
        "top_trapezoid_centroid": top_trapezoid_centroid,
        "web_centroid": web_centroid,
        "bottom_trapezoid_centroid": bottom_trapezoid_centroid,
        "bottom_flange_centroid": bottom_flange_centroid,
        "distance_to_centroid_y_axis_from_the_bottom_of_the_section": distance_to_centroid_y_axis_from_the_bottom_of_the_section,
        "second_moment_of_area_about_x_axis_for_the_top_flange": second_moment_of_area_about_x_axis_for_the_top_flange,
        "second_moment_of_area_about_the_x_axis_for_the_top_tapered_sections": second_moment_of_area_about_the_x_axis_for_the_top_tapered_sections,
        "second_moment_of_area_about_x_axis_for_the_web": second_moment_of_area_about_x_axis_for_the_web,
        "second_moment_of_area_about_the_x_axis_for_the_bottom_tapered_sections": second_moment_of_area_about_the_x_axis_for_the_bottom_tapered_sections,
        "second_moment_of_area_about_x_axis_for_the_bot_flange": second_moment_of_area_about_x_axis_for_the_bot_flange,
        "second_moment_of_area_about_x_axis": second_moment_of_area_about_x_axis,
        "second_moment_of_area_about_the_x1_axis": second_moment_of_area_about_the_x1_axis,
        "second_moment_of_area_about_the_y_axis_for_the_major_flange": second_moment_of_area_about_the_y_axis_for_the_major_flange,
        "second_moment_of_area_about_the_y_axis_for_the_minor_flange": second_moment_of_area_about_the_y_axis_for_the_minor_flange,
        "second_moment_if_area_about_the_y_axis_for_the_web": second_moment_if_area_about_the_y_axis_for_the_web,
        "second_moment_of_area_about_the_y_axis_for_the_top_tapered_section": second_moment_of_area_about_the_y_axis_for_the_top_tapered_section,
        "second_moment_of_area_about_the_y_axis_for_the_bottom_tapered_section": second_moment_of_area_about_the_y_axis_for_the_bottom_tapered_section,
        "second_moment_of_area_about_y_axis": second_moment_of_area_about_y_axis,
        "second_moment_of_area_about_the_y1_axis": second_moment_of_area_about_the_y1_axis,
        "polar_second_moment_of_area_about_the_z_axis": polar_second_moment_of_area_about_the_z_axis,
        "polar_second_moment_of_area_about_the_z1_axis": polar_second_moment_of_area_about_the_z1_axis,
        "radius_of_gyration_about_x_axis": radius_of_gyration_about_x_axis,
        "radius_of_gyration_about_y_axis": radius_of_gyration_about_y_axis,
        "radius_of_gyration_about_the_z_axis": radius_of_gyration_about_the_z_axis,
        "radius_of_gyration_about_the_x1_axis": radius_of_gyration_about_the_x1_axis,
        "radius_of_gyration_about_the_y1_axis": radius_of_gyration_about_the_y1_axis,
        "radius_of_gyration_about_the_z1_axis": radius_of_gyration_about_the_z1_axis,
        "elastic_section_modulus_about_x_axis": elastic_section_modulus_about_x_axis,
        "elastic_section_modulus_about_y_axis": elastic_section_modulus_about_y_axis,
        "half_of_section_area": half_of_section_area,
        "lower_trapezoid_flange_boundary": lower_trapezoid_flange_boundary,
        "lower_trapezoid_web_boundary": lower_trapezoid_web_boundary,
        "upper_trapezoid_web_boundary": upper_trapezoid_web_boundary,
        "upper_trapezoid_flange_boundary": upper_trapezoid_flange_boundary,
        "upper_section_boundary": upper_section_boundary,
        "area_boundary_bottom_flange": area_boundary_bottom_flange,
        "area_boundary_bottom_trapezoid": area_boundary_bottom_trapezoid,
        "area_boundary_web": area_boundary_web,
        "area_boundary_top_trapezoid": area_boundary_top_trapezoid,
        "area_boundary_top_flange": area_boundary_top_flange,
        "bottom_trapezoid_gradient": bottom_trapezoid_gradient,
        "top_trapezoid_gradient": top_trapezoid_gradient,
        "bottom_quadratic_discriminant": bottom_quadratic_discriminant,
        "top_quadratic_discriminant": top_quadratic_discriminant,
        "candidate_for_bottom_flange": candidate_for_bottom_flange,
        "candidate_for_bottom_trapezoid": candidate_for_bottom_trapezoid,
        "candidate_for_web": candidate_for_web,
        "candidate_for_top_trapezoid": candidate_for_top_trapezoid,
        "candidate_for_top_flange": candidate_for_top_flange,
        "plastic_neutral_axis_location": plastic_neutral_axis_location,
        "distance_to_plastic_neutral_axis_from_lower_boundary": distance_to_plastic_neutral_axis_from_lower_boundary,
        "bottom_flange_term": bottom_flange_term,
        "the_width_at_the_pna_level_when_inside_the_bottom_trapezoid": the_width_at_the_pna_level_when_inside_the_bottom_trapezoid,
        "area_bottom_wedge": area_bottom_wedge,
        "lever_arm_bottom_wedge": lever_arm_bottom_wedge,
        "bottom_wedge_term": bottom_wedge_term,
        "area_top_wedge": area_top_wedge,
        "lever_arm_top_wedge": lever_arm_top_wedge,
        "top_wedge_term": top_wedge_term,
        "bottom_trapezoid_term": bottom_trapezoid_term,
        "web_term": web_term,
        "the_width_at_the_pna_level_when_inside_the_top_trapezoid": the_width_at_the_pna_level_when_inside_the_top_trapezoid,
        "area_bottom_wedge_component_a_bw_top_trapz": area_bottom_wedge_component_a_bw_top_trapz,
        "lever_arm_bottom_wedge_component_y_bw_top_trapz": lever_arm_bottom_wedge_component_y_bw_top_trapz,
        "bottom_wedge_term_component_z_bw_top_trapz": bottom_wedge_term_component_z_bw_top_trapz,
        "area_top_wedge_component_a_tw_top_trapz": area_top_wedge_component_a_tw_top_trapz,
        "lever_arm_top_wedge_component_y_tw_top_trapz": lever_arm_top_wedge_component_y_tw_top_trapz,
        "top_wedge_term_component_z_tw_top_trapz": top_wedge_term_component_z_tw_top_trapz,
        "top_trapezoid_term": top_trapezoid_term,
        "top_flange_term": top_flange_term,
        "plastic_section_modulus_about_x_axis": plastic_section_modulus_about_x_axis,
        "flanges_contribution_term": flanges_contribution_term,
        "central_web_term": central_web_term,
        "top_wings_term": top_wings_term,
        "bottom_wings_term": bottom_wings_term,
        "plastic_section_mosulus_about_y_axis": plastic_section_mosulus_about_y_axis,
    }
