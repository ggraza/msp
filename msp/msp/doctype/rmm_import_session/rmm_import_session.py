# Copyright (c) 2026, itsdave GmbH and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class RMMImportSession(Document):
    def validate(self):
        self.update_statistics()

    def update_statistics(self):
        """Update statistics based on agent_selection table."""
        if not self.agent_selection:
            return

        self.agents_total = len(self.agent_selection)
        self.agents_to_create = sum(
            1 for a in self.agent_selection if a.action == "Create"
        )
        self.agents_to_update = sum(
            1 for a in self.agent_selection if a.action == "Update"
        )
        self.agents_skipped = sum(
            1 for a in self.agent_selection if a.action == "Skip"
        )

    def get_selected_agents(self):
        """Get all selected agents."""
        return [a for a in self.agent_selection if a.selected]

    def get_selected_for_create(self):
        """Get agents selected for creation."""
        return [
            a for a in self.agent_selection if a.selected and a.action == "Create"
        ]

    def get_selected_for_update(self):
        """Get agents selected for update."""
        return [
            a for a in self.agent_selection if a.selected and a.action == "Update"
        ]

    def add_log(self, message):
        """Add a message to the import log."""
        import datetime

        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {message}\n"

        if self.import_log:
            self.import_log += log_entry
        else:
            self.import_log = log_entry
