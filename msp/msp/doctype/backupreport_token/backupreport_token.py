# Copyright (c) 2026, itsdave GmbH and contributors
# For license information, please see license.txt

import frappe
import requests
from frappe.model.document import Document


class BackupreportToken(Document):
	def before_insert(self):
		"""Erstellt Token in API wenn manuell angelegt"""
		# Nur wenn keine token_id (= manuell erstellt, nicht via Sync)
		if not self.token_id:
			self._create_in_api()

	def validate(self):
		"""Validiert und entfernt Duplikate aus Host-Bindings"""
		seen = set()
		unique_hosts = []
		for host in self.allowed_hosts:
			if host.hostname_pattern not in seen:
				seen.add(host.hostname_pattern)
				unique_hosts.append(host)
		self.allowed_hosts = unique_hosts

	def on_update(self):
		"""Synchronisiert Host-Bindings mit API"""
		if self.token_id and not self.flags.ignore_api_sync:
			self._sync_host_bindings()

	def on_trash(self):
		"""Löscht Token in API"""
		if self.token_id:
			try:
				self._api_request(f"/admin/tokens/{self.token_id}", method="DELETE")
			except Exception:
				pass  # Ignorieren wenn API-Löschung fehlschlägt

	def _create_in_api(self):
		"""Erstellt den Token über die API"""
		instance = self.get_instance()
		url = instance.api_url.rstrip("/") + "/admin/tokens"
		headers = {"X-Admin-Key": instance.get_password("admin_key")}

		try:
			response = requests.post(url, headers=headers, data={"name": self.token_name}, timeout=30)
			response.raise_for_status()
			result = response.json()

			self.token_id = result.get("token_id")
			self.token_value = result.get("token", "")
			self.active = 1

			frappe.msgprint(
				f"Token in API erstellt. Token-Wert wurde gespeichert.",
				indicator="green"
			)
		except requests.exceptions.RequestException as e:
			frappe.throw(f"Konnte Token nicht in API erstellen: {str(e)}")

	def _sync_host_bindings(self):
		"""Synchronisiert Host-Bindings zur API"""
		# Aktuelle Hosts aus API holen
		try:
			api_data = self._api_request(f"/admin/tokens/{self.token_id}")
			api_hosts = set(api_data.get("allowed_hosts", []))
		except Exception:
			return  # Bei Fehler nicht synchronisieren

		# Lokale Hosts
		local_hosts = set(h.hostname_pattern for h in self.allowed_hosts)

		# Neue Hosts zur API hinzufügen
		for host in local_hosts - api_hosts:
			try:
				self._api_request(
					f"/admin/tokens/{self.token_id}/hosts",
					method="POST",
					data={"hostname_pattern": host}
				)
			except Exception:
				pass

		# Entfernte Hosts aus API löschen
		for host in api_hosts - local_hosts:
			try:
				self._api_request(
					f"/admin/tokens/{self.token_id}/hosts/{host}",
					method="DELETE"
				)
			except Exception:
				pass

	def get_instance(self):
		"""Holt die zugehörige Backupreport Instance"""
		return frappe.get_doc("Backupreport Instance", self.backupreport_instance)

	def _api_request(self, endpoint, method="GET", data=None):
		"""HTTP-Request an die API"""
		instance = self.get_instance()
		url = instance.api_url.rstrip("/") + endpoint
		headers = {"X-Admin-Key": instance.get_password("admin_key")}

		try:
			if method == "GET":
				response = requests.get(url, headers=headers, timeout=30)
			elif method == "POST":
				response = requests.post(url, headers=headers, data=data, timeout=30)
			elif method == "DELETE":
				response = requests.delete(url, headers=headers, timeout=30)
			else:
				raise ValueError(f"Unsupported method: {method}")

			response.raise_for_status()
			return response.json()
		except requests.exceptions.RequestException as e:
			frappe.log_error(f"Backup API Error: {str(e)}", "Backupreport Token")
			frappe.throw(f"API Error: {str(e)}")

	@frappe.whitelist()
	def get_token_value(self):
		"""Gibt den Token-Wert zurück (falls vorhanden)"""
		try:
			return self.get_password("token_value")
		except Exception:
			return None

	@frappe.whitelist()
	def activate(self):
		"""Aktiviert den Token über die API"""
		if not self.token_id:
			frappe.throw("Token hat keine API-ID")

		result = self._api_request(f"/admin/tokens/{self.token_id}/activate", method="POST")
		self.active = 1
		self.save()
		frappe.msgprint(f"Token '{self.token_name}' aktiviert")
		return result

	@frappe.whitelist()
	def revoke(self):
		"""Deaktiviert den Token über die API"""
		if not self.token_id:
			frappe.throw("Token hat keine API-ID")

		result = self._api_request(f"/admin/tokens/{self.token_id}/revoke", method="POST")
		self.active = 0
		self.save()
		frappe.msgprint(f"Token '{self.token_name}' deaktiviert")
		return result

	@frappe.whitelist()
	def delete_token(self):
		"""Löscht den Token über die API und lokal"""
		if not self.token_id:
			frappe.throw("Token hat keine API-ID")

		# Erst API, dann lokal
		self._api_request(f"/admin/tokens/{self.token_id}", method="DELETE")
		token_name = self.token_name
		self.delete()
		frappe.msgprint(f"Token '{token_name}' gelöscht")

	@frappe.whitelist()
	def add_host_binding(self, pattern):
		"""Fügt ein Host-Binding über die API hinzu"""
		if not self.token_id:
			frappe.throw("Token hat keine API-ID")

		if not pattern:
			frappe.throw("Bitte ein Pattern eingeben")

		result = self._api_request(
			f"/admin/tokens/{self.token_id}/hosts",
			method="POST",
			data={"hostname_pattern": pattern}
		)

		# Lokal hinzufügen
		self.append("allowed_hosts", {
			"hostname_pattern": pattern
		})
		self.save()
		frappe.msgprint(f"Host-Binding '{pattern}' hinzugefügt")
		return result

	@frappe.whitelist()
	def remove_host_binding(self, pattern):
		"""Entfernt ein Host-Binding über die API"""
		if not self.token_id:
			frappe.throw("Token hat keine API-ID")

		result = self._api_request(
			f"/admin/tokens/{self.token_id}/hosts/{pattern}",
			method="DELETE"
		)

		# Lokal entfernen
		self.allowed_hosts = [h for h in self.allowed_hosts if h.hostname_pattern != pattern]
		self.save()
		frappe.msgprint(f"Host-Binding '{pattern}' entfernt")
		return result

	@frappe.whitelist()
	def sync_from_api(self):
		"""Synchronisiert Token-Details von der API"""
		if not self.token_id:
			frappe.throw("Token hat keine API-ID")

		data = self._api_request(f"/admin/tokens/{self.token_id}")

		self.active = 1 if data.get("active") else 0
		self.token_hash_preview = data.get("token_hash_preview", "")
		self.backup_count = data.get("backup_count", 0)

		# Host-Bindings synchronisieren
		self.allowed_hosts = []
		for host in data.get("allowed_hosts", []):
			self.append("allowed_hosts", {
				"hostname_pattern": host if isinstance(host, str) else host.get("hostname_pattern", host)
			})

		self.save()
		frappe.msgprint("Token synchronisiert")
