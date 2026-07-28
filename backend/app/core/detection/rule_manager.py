import os
import yaml
import logging
import aiohttp
import asyncio
from typing import List, Dict

logger = logging.getLogger(__name__)

class RuleManager:
    def __init__(self, rules_dir: str = "data/rules"):
        self.rules_dir = rules_dir
        self.rules: List[Dict] = []
        os.makedirs(self.rules_dir, exist_ok=True)
        self._create_default_rule_if_missing()
        self.load_local_rules()

    def _create_default_rule_if_missing(self):
        default_rule_path = os.path.join(self.rules_dir, "ssh_brute_force.yml")
        if not os.path.exists(default_rule_path):
            default_rule = """
name: SSH Brute Force
description: Detects multiple SSH auth failures from the same source
condition: count > 5 within 5m
selection:
  type: malicious_ip
  dest_port: 22
mitre:
  tactic: TA0006 # Credential Access
  technique: T1110 # Brute Force
severity: high
"""
            with open(default_rule_path, "w") as f:
                f.write(default_rule.strip())

    def load_local_rules(self):
        self.rules = []
        for filename in os.listdir(self.rules_dir):
            if filename.endswith((".yml", ".yaml")):
                filepath = os.path.join(self.rules_dir, filename)
                try:
                    with open(filepath, "r") as f:
                        raw_yaml = f.read()
                        rule = yaml.safe_load(raw_yaml)
                        if rule:
                            rule['raw_yaml'] = raw_yaml
                            rule['is_local'] = True
                            rule['filename'] = filename
                            self.rules.append(rule)
                except Exception as e:
                    logger.error(f"Failed to load rule {filename}: {e}")
        logger.info(f"Loaded {len(self.rules)} rules locally.")

    async def pull_rules_from_github(self, repo_url: str = None):
        # Stub for GitHub API pull
        # Normally we would use aiohttp to hit GitHub API contents endpoint
        # For now, we just simulate loading local rules as if they were pulled
        logger.info("Syncing rules from GitHub (mock)...")
        self.load_local_rules()

    def get_rules(self) -> List[Dict]:
        return self.rules

rule_manager = RuleManager()
