# Copyright (c) 2025, itsdave GmbH and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class UserPrintSetting(Document):
	pass


@frappe.whitelist()
def get_user_print_setting(reference_doctype, user=None):
	"""Get print settings for a specific user and doctype.

	Args:
		reference_doctype: The DocType to get settings for
		user: Optional user, defaults to current user

	Returns:
		dict with printer and print_format or None
	"""
	if not user:
		user = frappe.session.user

	setting = frappe.db.get_value(
		"User Print Setting",
		{"user": user, "reference_doctype": reference_doctype},
		["printer", "print_format"],
		as_dict=True
	)

	return setting


@frappe.whitelist()
def save_user_print_setting(reference_doctype, printer=None, print_format=None, user=None):
	"""Save or update print settings for a user and doctype.

	Args:
		reference_doctype: The DocType to save settings for
		printer: Network Printer Settings name
		print_format: Print Format name
		user: Optional user, defaults to current user

	Returns:
		The saved document name
	"""
	if not user:
		user = frappe.session.user

	existing = frappe.db.exists(
		"User Print Setting",
		{"user": user, "reference_doctype": reference_doctype}
	)

	if existing:
		doc = frappe.get_doc("User Print Setting", existing)
		doc.printer = printer
		doc.print_format = print_format
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({
			"doctype": "User Print Setting",
			"user": user,
			"reference_doctype": reference_doctype,
			"printer": printer,
			"print_format": print_format
		})
		doc.insert(ignore_permissions=True)

	frappe.db.commit()
	return doc.name
