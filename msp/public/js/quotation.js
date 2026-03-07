frappe.ui.form.on('Quotation', {
    refresh: function(frm) {
        frm.add_custom_button(__('Anhänge hinzufügen'), function() {
            attach_item_attachments_to_quotation(frm);
        }, __("Aktionen"));

        frm.add_custom_button(__('Alle Anhänge entfernen'), function() {
            remove_all_attachments_from_quotation(frm);
        }, __("Aktionen"));

        style_actions_button(frm);
    }
});

function style_actions_button(frm) {
    setTimeout(() => {
        frm.$wrapper
            .find('.inner-group-button[data-label="' + __("Aktionen") + '"] > .btn')
            .css({
                "background-color": "#e73249",
                "border-color": "#e73249",
                "color": "#fff",
            });
    }, 100);
}

function attach_item_attachments_to_quotation(frm) {
    frm.doc.items.forEach(item_row => {
        frappe.call({
            method: 'msp.quotation_tools.copy_attachments',
            args: {
                'source_doctype': 'Item',
                'source_docname': item_row.item_code,
                'target_doctype': 'Quotation',
                'target_docname': frm.doc.name
            },
            callback: function(response) {
                if (!response.exc) {
                    frm.reload_doc();
                }
            }
        });
    });
    frappe.msgprint(__('Anhänge wurden hinzugefügt.'));
}

function remove_all_attachments_from_quotation(frm) {
    frappe.confirm(
        __('Möchten Sie wirklich alle Anhänge aus diesem Angebot entfernen?'),
        function() {
            frappe.call({
                method: 'msp.quotation_tools.remove_all_attachments',
                args: {
                    'doctype': 'Quotation',
                    'docname': frm.doc.name
                },
                callback: function(response) {
                    if (!response.exc) {
                        frappe.msgprint(__('Es wurden {0} Anhänge entfernt.', [response.message]));
                        frm.reload_doc();
                    }
                }
            });
        }
    );
}
