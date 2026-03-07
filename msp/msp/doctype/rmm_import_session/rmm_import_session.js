// Copyright (c) 2026, itsdave GmbH and contributors
// For license information, please see license.txt

frappe.ui.form.on('RMM Import Session', {
    refresh: function(frm) {
        // Set indicator color based on status
        if (frm.doc.status === 'Completed') {
            frm.page.set_indicator(__('Completed'), 'green');
        } else if (frm.doc.status === 'In Progress') {
            frm.page.set_indicator(__('In Progress'), 'orange');
        } else if (frm.doc.status === 'Failed') {
            frm.page.set_indicator(__('Failed'), 'red');
        } else {
            frm.page.set_indicator(__('Draft'), 'blue');
        }

        // Show AD statistics in dashboard if AD data was included
        if (frm.doc.include_ad_data) {
            frm.dashboard.add_indicator(__('AD Matched: {0}', [frm.doc.ad_matched_count || 0]), 'green');
            frm.dashboard.add_indicator(__('Only RMM: {0}', [frm.doc.rmm_only_count || 0]), 'blue');
            frm.dashboard.add_indicator(__('Only AD: {0}', [frm.doc.ad_only_count || 0]), 'orange');
        }

        // Link back to IT Landscape
        if (frm.doc.it_landscape) {
            frm.add_custom_button(__('Open IT Landscape'), function() {
                frappe.set_route('Form', 'IT Landscape', frm.doc.it_landscape);
            });
        }

        // Only show action buttons if status is Draft
        if (frm.doc.status === 'Draft') {
            // Primary action: Execute Import
            frm.add_custom_button(__('Execute Import'), function() {
                let selected_count = frm.doc.agent_selection.filter(a => a.selected).length;
                if (selected_count === 0) {
                    frappe.msgprint(__('Please select at least one agent to import.'));
                    return;
                }

                frappe.confirm(
                    __('Import {0} selected agents?', [selected_count]),
                    function() {
                        frm.call({
                            method: 'msp.rmm_import.execute_import',
                            args: {
                                session_name: frm.doc.name
                            },
                            freeze: true,
                            freeze_message: __('Importing agents...'),
                            callback: function(r) {
                                if (r.message) {
                                    frappe.show_alert({
                                        message: __('Import completed: {0} created, {1} updated, {2} failed',
                                            [r.message.created, r.message.updated, r.message.failed]),
                                        indicator: r.message.failed > 0 ? 'orange' : 'green'
                                    });
                                    frm.reload_doc();
                                }
                            }
                        });
                    }
                );
            }).addClass('btn-primary');

            // Selection buttons
            frm.add_custom_button(__('Select All New'), function() {
                frm.doc.agent_selection.forEach(row => {
                    if (row.action === 'Create') {
                        row.selected = 1;
                    }
                });
                frm.refresh_field('agent_selection');
                frm.dirty();
            }, __('Selection'));

            frm.add_custom_button(__('Select All Updates'), function() {
                frm.doc.agent_selection.forEach(row => {
                    if (row.action === 'Update') {
                        row.selected = 1;
                    }
                });
                frm.refresh_field('agent_selection');
                frm.dirty();
            }, __('Selection'));

            frm.add_custom_button(__('Select All'), function() {
                frm.doc.agent_selection.forEach(row => {
                    if (row.action !== 'Skip') {
                        row.selected = 1;
                    }
                });
                frm.refresh_field('agent_selection');
                frm.dirty();
            }, __('Selection'));

            frm.add_custom_button(__('Deselect All'), function() {
                frm.doc.agent_selection.forEach(row => {
                    row.selected = 0;
                });
                frm.refresh_field('agent_selection');
                frm.dirty();
            }, __('Selection'));

            // AD-based selection buttons (only if AD data is included)
            if (frm.doc.include_ad_data) {
                frm.add_custom_button(__('Select AD-Matched'), function() {
                    frm.doc.agent_selection.forEach(row => {
                        if (row.ad_matched) {
                            row.selected = 1;
                        }
                    });
                    frm.refresh_field('agent_selection');
                    frm.dirty();
                }, __('Selection'));

                frm.add_custom_button(__('Select Without AD-Match'), function() {
                    frm.doc.agent_selection.forEach(row => {
                        if (!row.ad_matched && row.action !== 'Skip') {
                            row.selected = 1;
                        }
                    });
                    frm.refresh_field('agent_selection');
                    frm.dirty();
                }, __('Selection'));

                frm.add_custom_button(__('Skip Disabled AD'), function() {
                    let count = 0;
                    frm.doc.agent_selection.forEach(row => {
                        if (row.ad_account_status === 'Disabled') {
                            row.selected = 0;
                            count++;
                        }
                    });
                    frm.refresh_field('agent_selection');
                    frm.dirty();
                    frappe.show_alert({
                        message: __('Deselected {0} agents with disabled AD accounts', [count]),
                        indicator: 'blue'
                    });
                }, __('Selection'));
            }

            // Refresh agents button
            frm.add_custom_button(__('Refresh Agents'), function() {
                frm.call({
                    method: 'msp.rmm_import.refresh_import_session',
                    args: {
                        session_name: frm.doc.name
                    },
                    freeze: true,
                    freeze_message: __('Refreshing agents from RMM...'),
                    callback: function(r) {
                        if (r.message) {
                            frappe.show_alert({
                                message: __('Agents refreshed: {0} total', [r.message.agent_count]),
                                indicator: 'green'
                            });
                            frm.reload_doc();
                        }
                    }
                });
            });
        }

        // Style the agent rows based on action and AD match status
        frm.fields_dict.agent_selection.$wrapper.find('.grid-row').each(function() {
            let row = $(this);
            let idx = row.data('idx');
            if (!idx) return;

            let agent_row = frm.doc.agent_selection[idx - 1];
            if (!agent_row) return;

            row.removeClass('indicator-green indicator-blue indicator-gray');
            row.css('background-color', '');

            // Style based on action
            if (agent_row.action === 'Create') {
                row.addClass('indicator-green');
            } else if (agent_row.action === 'Update') {
                row.addClass('indicator-blue');
            } else if (agent_row.action === 'Skip') {
                row.addClass('indicator-gray');
            }

            // Highlight AD-matched rows with a subtle green background
            if (frm.doc.include_ad_data && agent_row.ad_matched) {
                row.css('background-color', 'rgba(40, 167, 69, 0.1)');
            }

            // Warning style for disabled AD accounts
            if (agent_row.ad_account_status === 'Disabled') {
                row.css('background-color', 'rgba(255, 193, 7, 0.15)');
            }
        });
    },

    before_save: function(frm) {
        // Update statistics before save
        let total = frm.doc.agent_selection ? frm.doc.agent_selection.length : 0;
        let to_create = 0;
        let to_update = 0;
        let skipped = 0;

        if (frm.doc.agent_selection) {
            frm.doc.agent_selection.forEach(row => {
                if (row.action === 'Create') to_create++;
                else if (row.action === 'Update') to_update++;
                else if (row.action === 'Skip') skipped++;
            });
        }

        frm.doc.agents_total = total;
        frm.doc.agents_to_create = to_create;
        frm.doc.agents_to_update = to_update;
        frm.doc.agents_skipped = skipped;
    }
});

frappe.ui.form.on('RMM Import Agent', {
    selected: function(frm, cdt, cdn) {
        // Optional: Auto-save when selection changes
        // frm.dirty();
    }
});
