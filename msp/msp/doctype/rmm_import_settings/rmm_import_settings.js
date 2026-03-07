// Copyright (c) 2026, itsdave GmbH and contributors
// For license information, please see license.txt

frappe.ui.form.on('RMM Import Settings', {
    refresh: function(frm) {
        // Load available monitoring types and set as options
        frm.trigger('load_monitoring_types');

        // Add button to reset to defaults
        frm.add_custom_button(__('Reset to Defaults'), function() {
            frappe.confirm(
                __('This will reset all mappings to their default values. Continue?'),
                function() {
                    // Clear existing mappings
                    frm.clear_table('type_mapping');
                    frm.clear_table('status_mapping');
                    frm.clear_table('fields_to_update_on_sync');
                    frm.save().then(() => {
                        frappe.show_alert({
                            message: __('Settings reset to defaults'),
                            indicator: 'green'
                        });
                    });
                }
            );
        });

        // Add button to refresh monitoring types from all RMM instances
        frm.add_custom_button(__('Refresh Types from RMM'), function() {
            frappe.dom.freeze(__('Fetching monitoring types from all RMM instances...'));

            // Get all RMM instances and refresh their types
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'RMM Instance',
                    fields: ['name']
                },
                callback: function(r) {
                    if (r.message && r.message.length > 0) {
                        let promises = r.message.map(inst => {
                            return frappe.call({
                                method: 'msp.msp.doctype.rmm_instance.rmm_instance.refresh_monitoring_types',
                                args: { rmm_instance: inst.name }
                            });
                        });

                        Promise.all(promises).then(() => {
                            frappe.dom.unfreeze();
                            frappe.show_alert({
                                message: __('Monitoring types refreshed from all RMM instances'),
                                indicator: 'green'
                            });
                            frm.trigger('load_monitoring_types');
                        });
                    } else {
                        frappe.dom.unfreeze();
                        frappe.msgprint(__('No RMM instances found'));
                    }
                }
            });
        });
    },

    load_monitoring_types: function(frm) {
        // Fetch all unique monitoring types from RMM instances
        frappe.call({
            method: 'msp.msp.doctype.rmm_instance.rmm_instance.get_all_monitoring_types',
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    // Store for use in child table
                    frm._available_monitoring_types = r.message;

                    // Update the grid to show available types
                    frm.fields_dict.type_mapping.grid.update_docfield_property(
                        'rmm_monitoring_type',
                        'options',
                        r.message.join('\n')
                    );
                    frm.fields_dict.type_mapping.grid.update_docfield_property(
                        'rmm_monitoring_type',
                        'fieldtype',
                        'Select'
                    );
                    frm.refresh_field('type_mapping');
                }
            }
        });
    }
});

// Child table event handlers
frappe.ui.form.on('RMM Type Mapping', {
    type_mapping_add: function(frm, cdt, cdn) {
        // When a new row is added, ensure select options are available
        if (frm._available_monitoring_types) {
            frm.fields_dict.type_mapping.grid.update_docfield_property(
                'rmm_monitoring_type',
                'options',
                frm._available_monitoring_types.join('\n')
            );
        }
    }
});
