"""Section properties based on Enji’s template, with documented corrections."""

from typing import Annotated
from cso_python import (
    CalculationResults,
    calculation,
    section,
    symbol,
    text,
)


@calculation(
    id="tapered-area-inertia",
    title="Tapered section area and x-axis inertia",
    metadata={
        "referenceUrl": "https://www.enji.io/templates/basic-section-properties/unequal-tapered-i-beam",
        "corrections": ["Squared web parallel-axis distance"],
        "referenceExportSha256": "be2631bfc9179b680aa22ff7e58278743c959e8755cbecde5e41eb6c8ac7cfdf",
    },
)
@section(id="properties", title="Area and x-axis inertia", root=True)
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
) -> CalculationResults:
    text(id="scope", content="Area and centroidal x-axis second moment for an unequal tapered I-section. Dimensions must describe a valid section. The squared web parallel-axis distance corrects the Enji reference. These geometric properties do not establish structural capacity or design compliance.")
    web_depth: Annotated[
        float, symbol(id="L_t", glyph="L_{t}", description="Web depth", unit="mm")
    ] = (section_depth - inner_bot_flange_thickness - inner_top_flange_thickness)

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

    return {
        "web_depth": web_depth,
        "tapered_top_flange_segment_vertical_length": tapered_top_flange_segment_vertical_length,
        "tapered_bot_flange_segment_vertical_length": tapered_bot_flange_segment_vertical_length,
        "top_flange_area": top_flange_area,
        "top_trapezoid_area": top_trapezoid_area,
        "web_area": web_area,
        "bottom_trapezoid_area": bottom_trapezoid_area,
        "bottom_flange_area": bottom_flange_area,
        "total_area_of_the_section": total_area_of_the_section,
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
    }
