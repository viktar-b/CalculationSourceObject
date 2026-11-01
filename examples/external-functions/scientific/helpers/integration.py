"""Adapt SciPy values and convergence warnings to the native scalar boundary."""

import warnings

from scipy.integrate import IntegrationWarning, quad


def integrate_square(*, upper_limit: float, epsabs: float, epsrel: float):
    with warnings.catch_warnings():
        warnings.simplefilter("error", IntegrationWarning)
        value, absolute_error = quad(
            lambda coordinate: coordinate * coordinate,
            0.0,
            upper_limit,
            epsabs=epsabs,
            epsrel=epsrel,
        )
    return {"value": float(value), "absolute_error": float(absolute_error)}
