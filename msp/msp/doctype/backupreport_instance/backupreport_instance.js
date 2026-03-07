// Copyright (c) 2026, itsdave GmbH and contributors
// For license information, please see license.txt

frappe.ui.form.on("Backupreport Instance", {
	refresh(frm) {
		if (!frm.is_new()) {
			// View Logs Button
			frm.add_custom_button(__("View Logs"), function() {
				frappe.set_route("List", "Backupreport Log", {
					backupreport_instance: frm.doc.name
				});
			});

			// View Tokens Button
			frm.add_custom_button(__("View Tokens"), function() {
				frappe.set_route("List", "Backupreport Token", {
					backupreport_instance: frm.doc.name
				});
			});

			// Sync Tokens Button
			frm.add_custom_button(__("Sync Tokens"), function() {
				frappe.call({
					method: "sync_tokens",
					doc: frm.doc,
					freeze: true,
					freeze_message: __("Synchronisiere Tokens..."),
					callback: function(r) {
						frm.reload_doc();
					}
				});
			}, __("Tokens"));

			// Create Token Button
			frm.add_custom_button(__("Create Token"), function() {
				frappe.prompt([
					{
						label: __("Token Name"),
						fieldname: "token_name",
						fieldtype: "Data",
						reqd: 1
					}
				], function(values) {
					frappe.call({
						method: "create_token",
						doc: frm.doc,
						args: { token_name: values.token_name },
						freeze: true,
						freeze_message: __("Erstelle Token..."),
						callback: function(r) {
							if (r.message && r.message.token_value) {
								// Token-Wert in Dialog anzeigen
								let d = new frappe.ui.Dialog({
									title: __("Token erstellt"),
									fields: [
										{
											fieldtype: "HTML",
											options: `
												<div class="alert alert-warning">
													<strong>${r.message.warning}</strong>
												</div>
												<p><strong>Token Name:</strong> ${r.message.token_name}</p>
												<p><strong>Token:</strong></p>
												<pre style="user-select: all; background: #f5f5f5; padding: 10px; border-radius: 4px;">${r.message.token_value}</pre>
											`
										}
									],
									primary_action_label: __("Kopiert & Schließen"),
									primary_action: function() {
										navigator.clipboard.writeText(r.message.token_value);
										frappe.show_alert(__("Token in Zwischenablage kopiert"));
										d.hide();
									}
								});
								d.show();
							}
							frm.reload_doc();
						}
					});
				}, __("Neuen Token erstellen"), __("Erstellen"));
			}, __("Tokens"));
		}
	},

	sync_now(frm) {
		frappe.call({
			method: "sync_now",
			doc: frm.doc,
			freeze: true,
			freeze_message: __("Synchronisiere Backups..."),
			callback: function(r) {
				frm.reload_doc();
			}
		});
	}
});
