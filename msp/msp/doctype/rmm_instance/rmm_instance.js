// Copyright (c) 2023, itsdave GmbH and contributors
// For license information, please see license.txt

frappe.ui.form.on('RMM Instance', {
	refresh: function(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(__('Test Connection'), function() {
				frappe.dom.freeze(__('Testing connection to Tactical RMM...'));
				frappe.call({
					method: 'msp.msp.doctype.rmm_instance.rmm_instance.test_connection',
					args: {
						rmm_instance: frm.doc.name
					},
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.exc) {
							frappe.msgprint({
								title: __('Connection Failed'),
								indicator: 'red',
								message: __('Could not connect to Tactical RMM. Please check your credentials.')
							});
							return;
						}
						if (r.message && r.message.success) {
							frappe.msgprint({
								title: __('Connection Successful'),
								indicator: 'green',
								message: `${__('Successfully connected to Tactical RMM!')}<br><br>` +
									`<b>${__('Agents found')}:</b> ${r.message.agent_count}<br>` +
									`<b>${__('Clients')}:</b> ${r.message.clients.join(', ') || 'None'}`
							});
						} else {
							let error_msg = r.message.error || __('Unknown error occurred');
							// Check if it's an SSL error and suggest enabling the checkbox
							if (error_msg.toLowerCase().includes('ssl') && !frm.doc.ignore_ssl) {
								frappe.msgprint({
									title: __('Connection Failed'),
									indicator: 'red',
									message: `${error_msg}<br><br>${__('Tip: Enable "Ignore SSL Certificate" checkbox and try again.')}`
								});
							} else {
								frappe.msgprint({
									title: __('Connection Failed'),
									indicator: 'red',
									message: error_msg
								});
							}
						}
					}
				});
			}).addClass('btn-primary');

			// Button to refresh monitoring types
			frm.add_custom_button(__('Refresh Monitoring Types'), function() {
				frappe.dom.freeze(__('Fetching monitoring types from RMM...'));
				frappe.call({
					method: 'msp.msp.doctype.rmm_instance.rmm_instance.refresh_monitoring_types',
					args: {
						rmm_instance: frm.doc.name
					},
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.exc) {
							frappe.msgprint({
								title: __('Error'),
								indicator: 'red',
								message: __('Could not fetch monitoring types.')
							});
							return;
						}
						if (r.message && r.message.success) {
							frappe.show_alert({
								message: __('Found {0} monitoring types: {1}',
									[r.message.count, r.message.monitoring_types.join(', ')]),
								indicator: 'green'
							});
							frm.reload_doc();
						} else {
							frappe.msgprint({
								title: __('Error'),
								indicator: 'red',
								message: r.message.error || __('Unknown error')
							});
						}
					}
				});
			});
		}
	}
});
