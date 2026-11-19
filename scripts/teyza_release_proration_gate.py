"""Fail-closed check for the live R99 South African calendar-proration contract.

This validates the mobile release preflight against the existing production
service. It never changes Paystack pricing, billing rules, or subscriptions.
"""
import calendar
from datetime import date, datetime, timedelta, timezone

SA_TIMEZONE = timezone(timedelta(hours=2))
MONTHLY_CENTS = 9900
PRORATED_TERMS = "seller-r99-calendar-proration-2026-11"


def expected_initial_cents(day: date) -> int:
    """Mirror JS Math.round(9900 * remainingDays / daysInMonth)."""
    days_in_month = calendar.monthrange(day.year, day.month)[1]
    remaining_days = days_in_month - day.day + 1
    numerator = MONTHLY_CENTS * remaining_days
    # Integer arithmetic equivalent to JS Math.round for non-negative values.
    return (2 * numerator + days_in_month) // (2 * days_in_month)


def validate_billing_health(health: dict, *, now: datetime | None = None) -> list[str]:
    """Check exact approved proration terms, date and today's charge in ZAR cents.

    The live endpoint computes its price at the moment of the health request;
    a date mismatch must fail closed (rerun after the date boundary).
    """
    failures = []
    if health.get("membershipProrationEnabled") is not True:
        failures.append("membershipProrationEnabled (expected true; no reverting to flat-rate checkout)")
    if health.get("subscriptionTermsVersion") != PRORATED_TERMS:
        failures.append("subscriptionTermsVersion (unexpected proration contract)")
    if type(health.get("subscriptionMonthlyCents")) is not int or health["subscriptionMonthlyCents"] != MONTHLY_CENTS:
        failures.append("subscriptionMonthlyCents (recurring renewal must remain R99)")

    quoted_text = health.get("membershipProrationQuoteDate")
    try:
        quoted_date = date.fromisoformat(quoted_text) if isinstance(quoted_text, str) else None
        if quoted_date is None or quoted_date.isoformat() != quoted_text:
            raise ValueError("invalid quoted date")
    except ValueError:
        failures.append("membershipProrationQuoteDate (missing or invalid ISO date)")
        return failures

    clock = now if now is not None else datetime.now(timezone.utc)
    if clock.tzinfo is None or clock.utcoffset() is None:
        raise ValueError("Release validation clock must be timezone-aware")
    today_sa = clock.astimezone(SA_TIMEZONE).date()
    if quoted_date != today_sa:
        failures.append("membershipProrationQuoteDate (stale or mismatched South African date)")

    expected = expected_initial_cents(quoted_date)
    actual = health.get("membershipInitialChargeCents")
    if type(actual) is not int or actual != expected:
        failures.append(
            "membershipInitialChargeCents (expected %s ZAR cents for %s, got %r)"
            % (expected, quoted_date.isoformat(), actual)
        )
    return failures
