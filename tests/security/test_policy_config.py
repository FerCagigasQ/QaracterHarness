import unittest

from src.policy.config import PolicyConfig, default_apolo_yaml


class PolicyConfigTest(unittest.TestCase):
    def test_policy_config_defaults_require_approval_and_restrict_writers(self) -> None:
        config = PolicyConfig.defaults()

        self.assertTrue(config.approval.human_approval_required_before_run)
        self.assertTrue(config.approval.risk_approval_required)
        self.assertEqual(config.permissions.pr_writers, ("claude", "codex"))
        self.assertEqual(config.permissions.atlassian_writers, ("claude", "codex"))

    def test_policy_config_loads_apolo_mapping_overrides(self) -> None:
        config = PolicyConfig.from_apolo_mapping(
            {
                "policy": {
                    "budget": {"max_tool_calls": 3},
                    "tool_allowlist": {"allowed_tools": ["read_file"]},
                }
            }
        )

        self.assertEqual(config.budget.max_tool_calls, 3)
        self.assertEqual(config.tool_allowlist.allowed_tools, ("read_file",))
        self.assertEqual(config.diff_size.max_files_changed, 20)

    def test_default_apolo_yaml_contains_expected_top_level_policy_shape(self) -> None:
        yaml_text = default_apolo_yaml()

        self.assertTrue(yaml_text.startswith("policy:"))
        self.assertIn("human_approval_required_before_run: true", yaml_text)
        self.assertIn("pr_writers:", yaml_text)
        self.assertIn("atlassian_writers:", yaml_text)
