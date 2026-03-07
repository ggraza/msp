# Copyright (c) 2026, itsdave GmbH and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class RMMImportSettings(Document):
    def validate(self):
        self.ensure_default_mappings()

    def ensure_default_mappings(self):
        """Ensure default mappings exist if tables are empty."""
        if not self.type_mapping:
            self.setup_default_type_mappings()
        if not self.status_mapping:
            self.setup_default_status_mappings()
        if not self.fields_to_update_on_sync:
            self.setup_default_update_fields()

    def setup_default_type_mappings(self):
        """Setup default type mappings."""
        default_mappings = [
            {"rmm_monitoring_type": "server", "it_object_type": "Server"},
            {"rmm_monitoring_type": "workstation", "it_object_type": "Workstation"},
        ]
        for mapping in default_mappings:
            # Check if IT Object Type exists
            if frappe.db.exists("IT Object Type", mapping["it_object_type"]):
                self.append("type_mapping", mapping)

    def setup_default_status_mappings(self):
        """Setup default status mappings."""
        default_mappings = [
            {"rmm_status": "online", "it_object_status": "in Production"},
            {"rmm_status": "offline", "it_object_status": "in Maintenance"},
            {"rmm_status": "overdue", "it_object_status": "in Maintenance"},
        ]
        for mapping in default_mappings:
            self.append("status_mapping", mapping)

    def setup_default_update_fields(self):
        """Setup default fields to update on sync."""
        # Fields that should be updated by default (RMM-specific)
        update_fields = [
            {"field_name": "rmm_local_ip", "update_on_sync": 1},
            {"field_name": "rmm_public_ip", "update_on_sync": 1},
            {"field_name": "rmm_operating_system", "update_on_sync": 1},
            {"field_name": "rmm_last_seen", "update_on_sync": 1},
            {"field_name": "rmm_last_user", "update_on_sync": 1},
            {"field_name": "rmm_specs", "update_on_sync": 1},
            {"field_name": "rmm_software", "update_on_sync": 1},
            {"field_name": "rmm_patches_pending", "update_on_sync": 1},
            {"field_name": "rmm_needs_reboot", "update_on_sync": 1},
            # Fields that should NOT be updated by default (user-defined)
            {"field_name": "title", "update_on_sync": 0},
            {"field_name": "type", "update_on_sync": 0},
            {"field_name": "status", "update_on_sync": 0},
            {"field_name": "serial_number", "update_on_sync": 0},
            {"field_name": "description", "update_on_sync": 0},
        ]
        for field in update_fields:
            self.append("fields_to_update_on_sync", field)

    def get_type_mapping(self, rmm_monitoring_type):
        """Get IT Object Type for a given RMM monitoring type."""
        for mapping in self.type_mapping:
            if mapping.rmm_monitoring_type.lower() == rmm_monitoring_type.lower():
                return mapping.it_object_type
        return None

    def get_status_mapping(self, rmm_status):
        """Get IT Object Status for a given RMM status."""
        for mapping in self.status_mapping:
            if mapping.rmm_status.lower() == rmm_status.lower():
                return mapping.it_object_status
        return None

    def should_update_field(self, field_name):
        """Check if a field should be updated during sync."""
        for field in self.fields_to_update_on_sync:
            if field.field_name == field_name:
                return bool(field.update_on_sync)
        # Default: update RMM fields, don't update others
        return field_name.startswith("rmm_")


@frappe.whitelist()
def get_settings():
    """Get RMM Import Settings document."""
    return frappe.get_single("RMM Import Settings")
