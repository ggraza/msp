# Copyright (c) 2024, itsdave GmbH and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_available_printers():
	"""Get list of all configured Network Printer Settings.

	Returns:
		list of dicts with value and label
	"""
	printers = frappe.get_all(
		"Network Printer Settings",
		fields=["name", "printer_name"],
		order_by="name"
	)

	return [
		{"value": p.name, "label": f"{p.name} ({p.printer_name})"}
		for p in printers
	]


@frappe.whitelist()
def get_label_print_formats():
	"""Get list of Print Formats suitable for labels (Item doctype).

	Returns:
		list of dicts with value and label
	"""
	formats = frappe.get_all(
		"Print Format",
		filters={"doc_type": "Item", "disabled": 0},
		fields=["name"],
		order_by="name"
	)

	return [{"value": f.name, "label": f.name} for f in formats]


@frappe.whitelist()
def print_item_labels(item_code, quantity, printer_setting, print_format="label"):
	"""Print labels for an item in the specified quantity.

	Args:
		item_code: The Item code to print labels for
		quantity: Number of labels to print
		printer_setting: Network Printer Settings name
		print_format: Print Format name (default: 'label')

	Returns:
		dict with success status and count
	"""
	from frappe.utils.print_format import print_by_server

	quantity = int(quantity)
	if quantity < 1:
		frappe.throw(_("Quantity must be at least 1"))

	if quantity > 100:
		frappe.throw(_("Maximum 100 labels per print job"))

	# Verify item exists
	if not frappe.db.exists("Item", item_code):
		frappe.throw(_("Item {0} not found").format(item_code))

	# Verify printer exists
	if not frappe.db.exists("Network Printer Settings", printer_setting):
		frappe.throw(_("Printer {0} not found").format(printer_setting))

	printed = 0
	errors = []

	for i in range(quantity):
		try:
			print_by_server(
				doctype="Item",
				name=item_code,
				printer_setting=printer_setting,
				print_format=print_format,
				no_letterhead=1
			)
			printed += 1
		except Exception as e:
			errors.append(str(e))
			frappe.log_error(
				title=f"Label Print Failed: {item_code}",
				message=f"Copy {i+1}/{quantity}: {str(e)}"
			)

	if errors and printed == 0:
		frappe.throw(_("Printing failed: {0}").format(errors[0]))

	return {
		"success": True,
		"printed": printed,
		"total": quantity,
		"errors": len(errors)
	}


@frappe.whitelist()
def print_multiple_item_labels(items, printer_setting, print_format="label"):
	"""Print labels for multiple items.

	Args:
		items: JSON string or list of dicts with item_code and quantity
		printer_setting: Network Printer Settings name
		print_format: Print Format name

	Returns:
		dict with success status and details
	"""
	import json

	if isinstance(items, str):
		items = json.loads(items)

	total_printed = 0
	total_requested = 0
	results = []

	for item in items:
		item_code = item.get("item_code")
		quantity = int(item.get("quantity", 0))

		if quantity < 1:
			continue

		total_requested += quantity

		try:
			result = print_item_labels(
				item_code=item_code,
				quantity=quantity,
				printer_setting=printer_setting,
				print_format=print_format
			)
			total_printed += result.get("printed", 0)
			results.append({
				"item_code": item_code,
				"printed": result.get("printed", 0),
				"success": True
			})
		except Exception as e:
			results.append({
				"item_code": item_code,
				"printed": 0,
				"success": False,
				"error": str(e)
			})

	return {
		"success": total_printed > 0,
		"total_printed": total_printed,
		"total_requested": total_requested,
		"results": results
	}


@frappe.whitelist()
def get_inventory_count_print_formats():
	"""Get list of Print Formats for Inventory Count labels.

	Since Inventory Item is a child table, we look for Print Formats
	that have 'Inventory Count' in their name or are explicitly marked
	for inventory counting.

	Returns:
		list of dicts with value and label
	"""
	formats = frappe.get_all(
		"Print Format",
		filters=[
			["disabled", "=", 0],
			["name", "like", "%Inventory Count%"]
		],
		fields=["name"],
		order_by="name"
	)

	result = [{"value": f.name, "label": f.name} for f in formats]

	# Always include default option
	if not any(f["value"] == "Default" for f in result):
		result.insert(0, {"value": "Default", "label": "Default (Built-in)"})

	return result


def get_inventory_count_data():
	"""Get the current inventory count data stored in frappe.flags.
	Called from Print Format Jinja template.
	"""
	return getattr(frappe.flags, "inventory_count_data", None)


@frappe.whitelist()
def print_inventory_count_label(inventory_item_name, quantity, printer_setting, print_format):
	"""Print count labels for an Inventory Item.

	Uses the standard print_by_server with count data stored in frappe.flags.

	Args:
		inventory_item_name: The Inventory Item document name
		quantity: Number of labels to print
		printer_setting: Network Printer Settings name
		print_format: Print Format name for Item doctype

	Returns:
		dict with success status and count
	"""
	from frappe.utils.print_format import print_by_server

	quantity = int(quantity)
	if quantity < 1:
		frappe.throw(_("Quantity must be at least 1"))

	if quantity > 100:
		frappe.throw(_("Maximum 100 labels per print job"))

	# Verify Inventory Item exists and get data
	if not frappe.db.exists("Inventory Item", inventory_item_name):
		frappe.throw(_("Inventory Item {0} not found").format(inventory_item_name))

	inv_item = frappe.get_doc("Inventory Item", inventory_item_name)

	# Verify printer exists
	if not frappe.db.exists("Network Printer Settings", printer_setting):
		frappe.throw(_("Printer {0} not found").format(printer_setting))

	# Verify item exists
	if not frappe.db.exists("Item", inv_item.item_code):
		frappe.throw(_("Item {0} not found").format(inv_item.item_code))

	# Store count data in cache for the Print Format to access
	count_data = {
		"counted_qty": int(inv_item.counted_qty or 0),
		"system_qty": int(inv_item.system_qty or 0),
		"difference": int(inv_item.difference or 0),
		"warehouse": inv_item.warehouse or "",
		"counted_by": inv_item.counted_by or "",
		"counted_at": frappe.utils.format_datetime(inv_item.counted_at, "dd.MM.yyyy HH:mm") if inv_item.counted_at else "",
	}
	# Store in cache with item_code as key (expires in 60 seconds)
	cache_key = f"inventory_count_label:{inv_item.item_code}"
	frappe.cache().set_value(cache_key, count_data, expires_in_sec=60)

	# Use "Inventory Count Label" print format, fallback to provided format
	actual_print_format = print_format
	if print_format == "Default" or not frappe.db.exists("Print Format", print_format):
		# Check if our custom format exists
		if frappe.db.exists("Print Format", "Inventory Count Label"):
			actual_print_format = "Inventory Count Label"
		else:
			frappe.throw(_("Print Format 'Inventory Count Label' not found. Please create it first."))

	printed = 0
	errors = []

	for i in range(quantity):
		try:
			print_by_server(
				doctype="Item",
				name=inv_item.item_code,
				printer_setting=printer_setting,
				print_format=actual_print_format,
				no_letterhead=1
			)
			printed += 1
		except Exception as e:
			errors.append(str(e))
			frappe.log_error(
				title=f"Inventory Count Label Print Failed: {inventory_item_name}",
				message=f"Copy {i+1}/{quantity}: {str(e)}"
			)

	# Clear cache
	frappe.cache().delete_value(cache_key)

	if errors and printed == 0:
		frappe.throw(_("Printing failed: {0}").format(errors[0]))

	return {
		"success": True,
		"printed": printed,
		"total": quantity,
		"errors": len(errors)
	}
