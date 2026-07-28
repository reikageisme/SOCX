import os
import yaml
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

class PlaybookManager:
    def __init__(self, playbooks_dir: str = "data/playbooks"):
        self.playbooks_dir = playbooks_dir
        self.playbooks: List[Dict] = []
        os.makedirs(self.playbooks_dir, exist_ok=True)
        self._create_default_playbook_if_missing()
        self.load_playbooks()

    def _create_default_playbook_if_missing(self):
        default_playbook_path = os.path.join(self.playbooks_dir, "ssh_brute_force_response.yml")
        if not os.path.exists(default_playbook_path):
            default_pb = """
name: Auto Block SSH Brute Force
trigger:
  incident_name: "SSH Brute Force"
  min_severity: high
actions:
  - type: block_ip_temp
    target: "{{ incident.source_ip }}"
    duration: 15m
    requires_approval: false
  - type: isolate_vm
    target: "{{ incident.dest_ip }}"
    requires_approval: true
"""
            with open(default_playbook_path, "w") as f:
                f.write(default_pb.strip())

    def load_playbooks(self):
        self.playbooks = []
        for filename in os.listdir(self.playbooks_dir):
            if filename.endswith((".yml", ".yaml")):
                filepath = os.path.join(self.playbooks_dir, filename)
                try:
                    with open(filepath, "r") as f:
                        pb = yaml.safe_load(f)
                        if pb:
                            self.playbooks.append(pb)
                except Exception as e:
                    logger.error(f"Failed to load playbook {filename}: {e}")
        logger.info(f"Loaded {len(self.playbooks)} playbooks.")

    def get_playbooks(self) -> List[Dict]:
        return self.playbooks

playbook_manager = PlaybookManager()
