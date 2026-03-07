# Copyright (c) 2023, itsdave GmbH and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from ipaddress import IPv4Address, IPv4Network


class MSPDocumentation(Document):
	pass


@frappe.whitelist()
def check_nat_available(it_object_name):
	"""
	Prüft ob für das IT Object ein 1:1 NAT-Netzwerk konfiguriert ist.

	Args:
		it_object_name: Name des IT Objects (Domain Controller)

	Returns:
		dict mit nat_available (bool) und optional nat_network_address
	"""
	try:
		it_object = frappe.get_doc("IT Object", it_object_name)

		if not it_object.main_ip:
			return {"nat_available": False}

		ip_address = frappe.get_doc("IP Address", it_object.main_ip)

		if not ip_address.ip_network:
			return {"nat_available": False}

		ip_network = frappe.get_doc("IP Network", ip_address.ip_network)

		nat_network_address = ip_network.get("1_to_1_nat_network_address")
		nat_available = bool(nat_network_address)

		return {
			"nat_available": nat_available,
			"nat_network_address": nat_network_address if nat_available else None
		}
	except Exception as e:
		frappe.log_error(f"Fehler bei NAT-Verfügbarkeitsprüfung: {str(e)}", "check_nat_available")
		return {"nat_available": False}


@frappe.whitelist()
def get_effective_ip(it_object_name, use_nat=False):
	"""
	Gibt die effektive IP-Adresse zurück (Original oder NAT).

	Bei 1:1 NAT wird der Host-Teil der Original-IP auf das NAT-Netzwerk übertragen.
	Beispiel: Original 192.168.1.10 in Netz 192.168.1.0/24, NAT-Netz 10.0.0.0
	         -> NAT-IP: 10.0.0.10

	Args:
		it_object_name: Name des IT Objects (Domain Controller)
		use_nat: Wenn True, wird die NAT-Adresse berechnet

	Returns:
		dict mit ip_address (str) und is_nat (bool)
	"""
	# use_nat kann als String "0" oder "1" übergeben werden
	if isinstance(use_nat, str):
		use_nat = use_nat in ("1", "true", "True")

	try:
		it_object = frappe.get_doc("IT Object", it_object_name)

		if not it_object.main_ip:
			return {"ip_address": None, "is_nat": False}

		ip_address_doc = frappe.get_doc("IP Address", it_object.main_ip)
		original_ip = ip_address_doc.ip_address

		if not use_nat:
			return {"ip_address": original_ip, "is_nat": False}

		# NAT-IP berechnen
		if not ip_address_doc.ip_network:
			return {"ip_address": original_ip, "is_nat": False}

		ip_network = frappe.get_doc("IP Network", ip_address_doc.ip_network)
		nat_network_address = ip_network.get("1_to_1_nat_network_address")

		if not nat_network_address:
			return {"ip_address": original_ip, "is_nat": False}

		# Host-Teil extrahieren und auf NAT-Netz anwenden
		original_network = IPv4Network(
			f"{ip_network.network_address}/{ip_network.cidr_mask}",
			strict=False
		)
		original_ip_obj = IPv4Address(original_ip)

		# Host-Teil berechnen (Offset vom Netzwerk-Start)
		host_part = int(original_ip_obj) - int(original_network.network_address)

		# NAT-IP berechnen
		nat_ip = IPv4Address(int(IPv4Address(nat_network_address)) + host_part)

		return {"ip_address": str(nat_ip), "is_nat": True}

	except Exception as e:
		frappe.log_error(f"Fehler bei IP-Berechnung: {str(e)}", "get_effective_ip")
		return {"ip_address": None, "is_nat": False}
