import frappe


def execute():
	"""
	Migrates global MSP Settings RMM credentials to a default RMM Instance.
	Links all IT Landscapes without an rmm_instance to the new default.
	"""
	settings = frappe.get_single("MSP Settings")

	# Check if migration is needed
	if not settings.api_url:
		print("No API URL in MSP Settings. Skipping RMM migration.")
		return

	# Check if a migration has already been done (same api_url exists)
	existing = frappe.db.exists("RMM Instance", {"api_url": settings.api_url})
	if existing:
		print(f"RMM Instance for {settings.api_url} already exists. Skipping migration.")
		return

	# Check if api_key exists
	api_key = settings.get_password("api_key") if settings.api_key else None
	if not api_key:
		print("No API Key in MSP Settings. Cannot migrate without credentials.")
		return

	# Create default RMM Instance
	rmm_instance = frappe.get_doc({
		"doctype": "RMM Instance",
		"caption": "Default (Migrated from MSP Settings)",
		"type": "Tactical RMM",
		"api_url": settings.api_url,
		"key": api_key
	})
	rmm_instance.insert()
	print(f"Created RMM Instance: {rmm_instance.name}")

	# Link to all IT Landscapes without an rmm_instance
	landscapes = frappe.get_all(
		"IT Landscape",
		filters=[["rmm_instance", "is", "not set"]],
		pluck="name"
	)

	for landscape_name in landscapes:
		frappe.db.set_value("IT Landscape", landscape_name, "rmm_instance", rmm_instance.name)

	frappe.db.commit()
	print(f"Linked RMM Instance to {len(landscapes)} IT Landscapes")
