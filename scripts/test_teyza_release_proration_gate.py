"""Regression tests for the Teyza signed-release billing readiness gate."""
import unittest
from datetime import date, datetime, timezone, timedelta

from teyza_release_proration_gate import (
    MONTHLY_CENTS, PRORATED_TERMS, expected_initial_cents, validate_billing_health,
)


def health(day, amount, *, enabled=True, terms=PRORATED_TERMS):
    return {
        "membershipProrationEnabled": enabled,
        "subscriptionTermsVersion": terms,
        "subscriptionMonthlyCents": MONTHLY_CENTS,
        "membershipProrationQuoteDate": day.isoformat(),
        "membershipInitialChargeCents": amount,
    }


class ProrationReleaseGateTests(unittest.TestCase):
    def test_november_19_prorated_amount_is_not_flat_99(self):
        day = date(2026, 11, 19)
        self.assertEqual(expected_initial_cents(day), 3960)
        self.assertEqual(validate_billing_health(health(day, 3960), now=datetime(2026, 11, 19, 8, tzinfo=timezone.utc)), [])

    def test_november_12_and_first_day(self):
        self.assertEqual(expected_initial_cents(date(2026, 11, 12)), 6270)
        self.assertEqual(expected_initial_cents(date(2026, 12, 1)), 9900)

    def test_leap_year_and_31_day_month(self):
        self.assertEqual(expected_initial_cents(date(2028, 2, 29)), 341)
        self.assertEqual(expected_initial_cents(date(2027, 1, 31)), 319)

    def test_south_african_date_is_used_not_utc_date(self):
        day = date(2026, 12, 1)
        # UTC is still November 30, but Johannesburg is December 1.
        now = datetime(2026, 11, 30, 22, 30, tzinfo=timezone.utc)
        self.assertEqual(validate_billing_health(health(day, 9900), now=now), [])

    def test_wrong_99_initial_charge_rejected(self):
        day = date(2026, 11, 19)
        self.assertTrue(any("membershipInitialChargeCents" in error for error in
                            validate_billing_health(health(day, 9900), now=datetime(2026, 11, 19, tzinfo=timezone.utc))))

    def test_old_terms_rejected(self):
        day = date(2026, 11, 19)
        self.assertTrue(any("subscriptionTermsVersion" in error for error in
                            validate_billing_health(health(day, 3960, terms="seller-r99-monthly-2026-11"),
                                                    now=datetime(2026, 11, 19, tzinfo=timezone.utc))))

    def test_disabled_proration_rejected(self):
        day = date(2026, 11, 19)
        self.assertTrue(any("membershipProrationEnabled" in error for error in
                            validate_billing_health(health(day, 3960, enabled=False),
                                                    now=datetime(2026, 11, 19, tzinfo=timezone.utc))))

    def test_stale_quote_date_rejected(self):
        day = date(2026, 11, 18)
        self.assertTrue(any("stale" in error for error in
                            validate_billing_health(health(day, expected_initial_cents(day)),
                                                    now=datetime(2026, 11, 19, tzinfo=timezone.utc))))

    def test_missing_or_invalid_date_rejected(self):
        for value in (None, "not-a-date", "2026-2-1"):
            payload = health(date(2026, 11, 19), 3960)
            payload["membershipProrationQuoteDate"] = value
            self.assertTrue(any("invalid ISO date" in error for error in
                                validate_billing_health(payload, now=datetime(2026, 11, 19, tzinfo=timezone.utc))))

    def test_false_boolean_cents_rejected(self):
        day = date(2026, 11, 19)
        payload = health(day, True)
        self.assertTrue(any("membershipInitialChargeCents" in error for error in
                            validate_billing_health(payload, now=datetime(2026, 11, 19, tzinfo=timezone.utc))))


if __name__ == "__main__":
    unittest.main()
