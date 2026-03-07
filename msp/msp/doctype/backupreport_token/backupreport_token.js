// Copyright (c) 2026, itsdave GmbH and contributors
// For license information, please see license.txt

frappe.ui.form.on("Backupreport Token", {
	refresh(frm) {
		if (!frm.is_new() && frm.doc.token_id) {
			// Sync Button
			frm.add_custom_button(__("Sync from API"), function() {
				frappe.call({
					method: "sync_from_api",
					doc: frm.doc,
					freeze: true,
					freeze_message: __("Synchronisiere..."),
					callback: function(r) {
						frm.reload_doc();
					}
				});
			});

			// Activate/Revoke Button
			if (frm.doc.active) {
				frm.add_custom_button(__("Revoke"), function() {
					frappe.confirm(
						__("Token wirklich deaktivieren?"),
						function() {
							frappe.call({
								method: "revoke",
								doc: frm.doc,
								freeze: true,
								callback: function(r) {
									frm.reload_doc();
								}
							});
						}
					);
				}, __("Actions"));
			} else {
				frm.add_custom_button(__("Activate"), function() {
					frappe.call({
						method: "activate",
						doc: frm.doc,
						freeze: true,
						callback: function(r) {
							frm.reload_doc();
						}
					});
				}, __("Actions"));
			}

			// Delete Button
			frm.add_custom_button(__("Delete Token"), function() {
				frappe.confirm(
					__("Token wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden!"),
					function() {
						frappe.call({
							method: "delete_token",
							doc: frm.doc,
							freeze: true,
							callback: function(r) {
								frappe.set_route("List", "Backupreport Token");
							}
						});
					}
				);
			}, __("Actions"));

			// Show Token Button
			frm.add_custom_button(__("Show Token"), function() {
				frappe.call({
					method: "get_token_value",
					doc: frm.doc,
					callback: function(r) {
						if (r.message) {
							frappe.msgprint({
								title: __("Token Value"),
								message: `<pre style="user-select: all; background: #f5f5f5; padding: 10px; border-radius: 4px;">${r.message}</pre>`,
								indicator: "blue"
							});
						} else {
							frappe.msgprint(__("Token-Wert nicht verfügbar. Dieser Token wurde extern erstellt."));
						}
					}
				});
			}, __("Token"));

			// Copy Token Button
			frm.add_custom_button(__("Copy Token"), function() {
				frappe.call({
					method: "get_token_value",
					doc: frm.doc,
					callback: function(r) {
						if (r.message) {
							navigator.clipboard.writeText(r.message).then(function() {
								frappe.show_alert({
									message: __("Token in Zwischenablage kopiert"),
									indicator: "green"
								});
							});
						} else {
							frappe.msgprint(__("Token-Wert nicht verfügbar. Dieser Token wurde extern erstellt."));
						}
					}
				});
			}, __("Token"));

			// Add Host Binding Button - öffnet Dialog
			frm.add_custom_button(__("Add Host Binding"), function() {
				frappe.prompt([
					{
						label: __("Hostname Pattern"),
						fieldname: "pattern",
						fieldtype: "Data",
						reqd: 1,
						description: __("z.B. 'web*', 'db-primary', '*-prod'")
					}
				], function(values) {
					frappe.call({
						method: "add_host_binding",
						doc: frm.doc,
						args: { pattern: values.pattern },
						freeze: true,
						callback: function(r) {
							frm.reload_doc();
						}
					});
				}, __("Host-Binding hinzufügen"), __("Hinzufügen"));
			}, __("Actions"));
		}
	}
});

// Host-Bindings werden über on_update synchronisiert - einfach speichern reicht
