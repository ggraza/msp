# Copyright (c) 2023, itsdave GmbH and contributors
# For license information, please see license.txt

import frappe
import requests
from frappe.model.document import Document
from frappe.utils import now_datetime


class RMMInstance(Document):
	def get_monitoring_types_list(self):
		"""Returns list of available monitoring types."""
		if self.available_monitoring_types:
			return [t.strip() for t in self.available_monitoring_types.split(",") if t.strip()]
		return []

	def get_api_credentials(self):
		"""
		Returns (api_url, headers, verify_ssl) tuple for making API requests to this RMM instance.

		Returns:
			tuple: (api_url: str, headers: dict, verify_ssl: bool)

		Raises:
			frappe.ValidationError: If api_url or key is missing
		"""
		if not self.api_url:
			frappe.throw(f"API URL is missing for RMM Instance '{self.caption}'")
		if not self.key:
			frappe.throw(f"API Key is missing for RMM Instance '{self.caption}'")

		headers = {
			"Content-Type": "application/json",
			"X-API-KEY": self.get_password("key"),
		}

		verify_ssl = not self.ignore_ssl

		return self.api_url, headers, verify_ssl


@frappe.whitelist()
def test_connection(rmm_instance):
	"""
	Tests the connection to a Tactical RMM instance.

	Args:
		rmm_instance (str): Name of the RMM Instance document

	Returns:
		dict: Result with success status, agent count, and client list
	"""
	try:
		doc = frappe.get_doc("RMM Instance", rmm_instance)
		api_url, headers, verify_ssl = doc.get_api_credentials()

		# Test connection by fetching agents
		response = requests.get(
			f"{api_url}/agents/",
			headers=headers,
			timeout=30,
			verify=verify_ssl
		)

		if response.status_code == 200:
			agents = response.json()
			# Extract unique client names
			clients = list(set(agent.get("client_name", "Unknown") for agent in agents))
			clients.sort()

			return {
				"success": True,
				"agent_count": len(agents),
				"clients": clients[:10]  # Limit to first 10 clients
			}
		elif response.status_code == 401:
			return {
				"success": False,
				"error": "Authentication failed. Please check your API key."
			}
		elif response.status_code == 403:
			return {
				"success": False,
				"error": "Access forbidden. API key may not have sufficient permissions."
			}
		else:
			return {
				"success": False,
				"error": f"API returned status code {response.status_code}"
			}

	except requests.exceptions.SSLError as e:
		return {
			"success": False,
			"error": f"SSL certificate error: {str(e)}. The certificate may be expired or invalid."
		}
	except requests.exceptions.Timeout:
		return {
			"success": False,
			"error": "Connection timed out. Please check the API URL."
		}
	except requests.exceptions.ConnectionError:
		return {
			"success": False,
			"error": "Could not connect to server. Please check the API URL."
		}
	except Exception as e:
		return {
			"success": False,
			"error": str(e)
		}


@frappe.whitelist()
def refresh_monitoring_types(rmm_instance):
	"""
	Fetches all unique monitoring types from the RMM instance and stores them.

	Args:
		rmm_instance (str): Name of the RMM Instance document

	Returns:
		dict: Result with success status and list of monitoring types
	"""
	try:
		doc = frappe.get_doc("RMM Instance", rmm_instance)
		api_url, headers, verify_ssl = doc.get_api_credentials()

		# Fetch all agents
		response = requests.get(
			f"{api_url}/agents/",
			headers=headers,
			timeout=30,
			verify=verify_ssl
		)

		if response.status_code == 200:
			agents = response.json()
			# Extract unique monitoring types
			monitoring_types = set()
			for agent in agents:
				mt = agent.get("monitoring_type", "")
				if mt:
					monitoring_types.add(mt.lower())

			# Sort and store
			types_list = sorted(list(monitoring_types))
			doc.available_monitoring_types = ",".join(types_list)
			doc.last_types_refresh = now_datetime()
			doc.save()
			frappe.db.commit()

			return {
				"success": True,
				"monitoring_types": types_list,
				"count": len(types_list)
			}
		else:
			return {
				"success": False,
				"error": f"API returned status code {response.status_code}"
			}

	except Exception as e:
		frappe.log_error(f"Error refreshing monitoring types: {str(e)}", "RMM Instance")
		return {
			"success": False,
			"error": str(e)
		}


@frappe.whitelist()
def get_all_monitoring_types():
	"""
	Get all unique monitoring types from all RMM instances.

	Returns:
		list: List of unique monitoring types
	"""
	instances = frappe.get_all("RMM Instance", fields=["available_monitoring_types"])
	all_types = set()

	for inst in instances:
		if inst.available_monitoring_types:
			for t in inst.available_monitoring_types.split(","):
				t = t.strip()
				if t:
					all_types.add(t)

	return sorted(list(all_types))
