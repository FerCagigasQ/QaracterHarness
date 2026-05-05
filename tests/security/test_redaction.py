import unittest

from src.policy.config import SecretsPolicy
from src.security.redaction import contains_sensitive_data, find_sensitive_data, redact_text


class RedactionTest(unittest.TestCase):
    def test_redacts_dummy_secret_like_value_when_placeholder_bypass_disabled(self) -> None:
        policy = SecretsPolicy(allow_dummy_placeholders=False)
        text = "api_key=DUMMY_SECRET_VALUE_123456"

        self.assertTrue(contains_sensitive_data(text, policy))
        self.assertEqual(redact_text(text, policy), "api_key=[REDACTED_SECRET]")

    def test_allows_dummy_placeholder_by_default(self) -> None:
        text = "password=DUMMY_PASSWORD_PLACEHOLDER"

        self.assertFalse(find_sensitive_data(text))
        self.assertEqual(redact_text(text), text)
