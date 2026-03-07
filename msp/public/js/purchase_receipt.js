frappe.ui.form.on('Purchase Receipt', {
	refresh: function(frm) {
		if (!frm.is_new() && frm.doc.docstatus < 2) {
			frm.add_custom_button(__('Print Labels'), function() {
				show_print_labels_dialog(frm);
			}, __("Aktionen"));

			style_actions_button(frm);
		}
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

function show_print_labels_dialog(frm) {
	// Load user settings, printers and print formats in parallel
	Promise.all([
		frappe.call({
			method: 'msp.msp.doctype.user_print_setting.user_print_setting.get_user_print_setting',
			args: { reference_doctype: 'Purchase Receipt' }
		}),
		frappe.call({
			method: 'msp.label_printing.get_available_printers'
		}),
		frappe.call({
			method: 'msp.label_printing.get_label_print_formats'
		})
	]).then(([settings_response, printers_response, formats_response]) => {
		const user_settings = settings_response.message || {};
		const printers = printers_response.message || [];
		const print_formats = formats_response.message || [];

		if (printers.length === 0) {
			frappe.msgprint(__('No printers configured. Please add a Network Printer Settings first.'));
			return;
		}

		// Build items table HTML
		let items_html = build_items_table(frm.doc.items);
		let total_qty = frm.doc.items.reduce((sum, item) => sum + (item.qty || 0), 0);

		// Create dialog
		let d = new frappe.ui.Dialog({
			title: __('Print Labels'),
			size: 'large',
			fields: [
				{
					fieldtype: 'Select',
					fieldname: 'printer',
					label: __('Printer'),
					options: printers.map(p => p.value),
					default: user_settings.printer || (printers[0] ? printers[0].value : ''),
					reqd: 1
				},
				{
					fieldtype: 'Select',
					fieldname: 'print_format',
					label: __('Print Format'),
					options: print_formats.map(f => f.value),
					default: user_settings.print_format || 'label',
					reqd: 1
				},
				{
					fieldtype: 'Check',
					fieldname: 'save_as_default',
					label: __('Save as default')
				},
				{
					fieldtype: 'Section Break'
				},
				{
					fieldtype: 'HTML',
					fieldname: 'items_table',
					options: items_html
				},
				{
					fieldtype: 'Section Break'
				},
				{
					fieldtype: 'HTML',
					fieldname: 'total_info',
					options: `<div class="text-muted">${__('Total')}: <span id="total-labels">${total_qty}</span> ${__('Labels')}</div>`
				}
			],
			primary_action_label: __('Print All'),
			primary_action: function() {
				print_all_labels(d, frm);
			}
		});

		// Add event handlers after dialog is shown
		d.show();
		setup_dialog_events(d, frm);
	});
}

function build_items_table(items) {
	let rows = items.map((item, idx) => {
		return `
			<tr data-idx="${idx}" data-item-code="${item.item_code}">
				<td style="vertical-align: middle;">
					<strong>${item.item_code}</strong><br>
					<small class="text-muted">${item.item_name || ''}</small>
				</td>
				<td style="vertical-align: middle; text-align: center;">
					${item.qty || 0}
				</td>
				<td style="vertical-align: middle; width: 80px;">
					<input type="number" class="form-control label-qty-input"
						data-idx="${idx}" value="${item.qty || 0}" min="0" max="100"
						style="width: 70px; text-align: center;">
				</td>
				<td style="vertical-align: middle; text-align: center;">
					<button class="btn btn-xs btn-primary print-qty-btn" data-idx="${idx}" title="${__('Print quantity')}">
						<i class="fa fa-print"></i>
					</button>
					<button class="btn btn-xs btn-default print-one-btn" data-idx="${idx}" title="${__('Print 1')}">
						1
					</button>
				</td>
			</tr>
		`;
	}).join('');

	return `
		<div class="table-responsive">
			<table class="table table-bordered table-hover" id="label-items-table">
				<thead>
					<tr>
						<th>${__('Item')}</th>
						<th style="text-align: center; width: 80px;">${__('Qty')}</th>
						<th style="text-align: center; width: 100px;">${__('Labels')}</th>
						<th style="text-align: center; width: 100px;">${__('Action')}</th>
					</tr>
				</thead>
				<tbody>
					${rows}
				</tbody>
			</table>
		</div>
	`;
}

function setup_dialog_events(d, frm) {
	// Update total when quantity changes
	d.$wrapper.on('change', '.label-qty-input', function() {
		update_total_labels(d);
	});

	// Print single item (quantity from input)
	d.$wrapper.on('click', '.print-qty-btn', function() {
		let idx = $(this).data('idx');
		let item = frm.doc.items[idx];
		let qty = parseInt(d.$wrapper.find(`.label-qty-input[data-idx="${idx}"]`).val()) || 0;

		if (qty < 1) {
			frappe.msgprint(__('Please enter a quantity greater than 0'));
			return;
		}

		print_single_item_labels(d, item.item_code, qty);
	});

	// Print exactly 1 label
	d.$wrapper.on('click', '.print-one-btn', function() {
		let idx = $(this).data('idx');
		let item = frm.doc.items[idx];
		print_single_item_labels(d, item.item_code, 1);
	});
}

function update_total_labels(d) {
	let total = 0;
	d.$wrapper.find('.label-qty-input').each(function() {
		total += parseInt($(this).val()) || 0;
	});
	d.$wrapper.find('#total-labels').text(total);
}

function print_single_item_labels(d, item_code, quantity) {
	let printer = d.get_value('printer');
	let print_format = d.get_value('print_format');
	let save_default = d.get_value('save_as_default');

	if (!printer) {
		frappe.msgprint(__('Please select a printer'));
		return;
	}

	frappe.call({
		method: 'msp.label_printing.print_item_labels',
		args: {
			item_code: item_code,
			quantity: quantity,
			printer_setting: printer,
			print_format: print_format
		},
		freeze: true,
		freeze_message: __('Printing {0} labels...', [quantity]),
		callback: function(r) {
			if (r.message && r.message.success) {
				frappe.show_alert({
					message: __('Printed {0} labels for {1}', [r.message.printed, item_code]),
					indicator: 'green'
				}, 3);

				// Save default settings if checkbox is checked
				if (save_default) {
					save_user_print_setting(printer, print_format);
				}
			}
		}
	});
}

function print_all_labels(d, frm) {
	let printer = d.get_value('printer');
	let print_format = d.get_value('print_format');
	let save_default = d.get_value('save_as_default');

	if (!printer) {
		frappe.msgprint(__('Please select a printer'));
		return;
	}

	// Collect items with quantities > 0
	let items = [];
	d.$wrapper.find('.label-qty-input').each(function() {
		let idx = $(this).data('idx');
		let qty = parseInt($(this).val()) || 0;
		if (qty > 0) {
			items.push({
				item_code: frm.doc.items[idx].item_code,
				quantity: qty
			});
		}
	});

	if (items.length === 0) {
		frappe.msgprint(__('No items with quantity > 0'));
		return;
	}

	let total_qty = items.reduce((sum, item) => sum + item.quantity, 0);

	frappe.call({
		method: 'msp.label_printing.print_multiple_item_labels',
		args: {
			items: items,
			printer_setting: printer,
			print_format: print_format
		},
		freeze: true,
		freeze_message: __('Printing {0} labels...', [total_qty]),
		callback: function(r) {
			if (r.message) {
				if (r.message.success) {
					frappe.show_alert({
						message: __('Printed {0} of {1} labels', [r.message.total_printed, r.message.total_requested]),
						indicator: 'green'
					}, 5);

					// Save default settings if checkbox is checked
					if (save_default) {
						save_user_print_settings(printer, print_format);
					}

					d.hide();
				} else {
					frappe.msgprint(__('Some labels could not be printed. Check the error log.'));
				}
			}
		}
	});
}

function save_user_print_setting(printer, print_format) {
	frappe.call({
		method: 'msp.msp.doctype.user_print_setting.user_print_setting.save_user_print_setting',
		args: {
			reference_doctype: 'Purchase Receipt',
			printer: printer,
			print_format: print_format
		}
	});
}
