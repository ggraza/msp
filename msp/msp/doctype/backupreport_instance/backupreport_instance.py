# Copyright (c) 2026, itsdave GmbH and contributors
# For license information, please see license.txt

import frappe
import requests
import json
from frappe.model.document import Document
from frappe.utils import now_datetime


class BackupreportInstance(Document):
	@frappe.whitelist()
	def sync_now(self):
		"""Button-Handler: Synchronisiert Backups von dieser Instanz"""
		if not self.enabled:
			frappe.throw("Diese Instanz ist deaktiviert")

		new_backups = self.fetch_backups()
		self.last_sync = now_datetime()
		self.save()

		frappe.msgprint(f"{new_backups} neue Backups synchronisiert")
		return new_backups

	def fetch_backups(self):
		"""Holt neue Backups von der API"""
		# Alle Backups abrufen
		response = self._api_request("/admin/backups?limit=10000")
		if not response:
			return 0

		backups = response.get("backups", [])
		new_count = 0
		max_id = self.last_backup_id or 0

		for backup in backups:
			backup_id = backup.get("id")

			# Nur neue Backups verarbeiten
			if backup_id <= (self.last_backup_id or 0):
				continue

			# Prüfen ob bereits existiert
			if frappe.db.exists("Backupreport Log", {
				"backupreport_instance": self.name,
				"backup_id": backup_id
			}):
				continue

			# Details abrufen
			details = self._api_request(f"/admin/backups/{backup_id}")
			if not details:
				continue

			# Log erstellen
			self._create_log(details)
			new_count += 1

			if backup_id > max_id:
				max_id = backup_id

		self.last_backup_id = max_id
		return new_count

	def _api_request(self, endpoint, method="GET", data=None):
		"""HTTP-Request mit Auth-Header"""
		url = self.api_url.rstrip("/") + endpoint
		headers = {"X-Admin-Key": self.get_password("admin_key")}

		try:
			if method == "GET":
				response = requests.get(url, headers=headers, timeout=30)
			elif method == "POST":
				response = requests.post(url, headers=headers, data=data, timeout=30)
			else:
				raise ValueError(f"Unsupported method: {method}")

			response.raise_for_status()
			return response.json()
		except requests.exceptions.RequestException as e:
			frappe.log_error(f"Backup API Error: {str(e)}", "Backupreport Sync")
			return None

	@frappe.whitelist()
	def sync_tokens(self):
		"""Synchronisiert alle Tokens von der API"""
		if not self.enabled:
			frappe.throw("Diese Instanz ist deaktiviert")

		response = self._api_request("/admin/tokens")
		if not response:
			frappe.throw("Konnte Tokens nicht abrufen")

		tokens = response.get("tokens", [])
		synced = 0
		created = 0

		for token_data in tokens:
			token_id = token_data.get("id")
			token_name = token_data.get("name")

			# Existiert bereits?
			existing = frappe.db.exists("Backupreport Token", {
				"backupreport_instance": self.name,
				"token_id": token_id
			})

			if existing:
				# Update
				doc = frappe.get_doc("Backupreport Token", existing)
				doc.active = 1 if token_data.get("active") else 0
				doc.token_hash_preview = token_data.get("token_hash_preview", "")
				doc.backup_count = token_data.get("backup_count", 0)

				# Host-Bindings aktualisieren
				doc.allowed_hosts = []
				for host in token_data.get("allowed_hosts", []):
					pattern = host if isinstance(host, str) else host.get("hostname_pattern", str(host))
					doc.append("allowed_hosts", {"hostname_pattern": pattern})

				doc.save()
				synced += 1
			else:
				# Neu erstellen
				doc = frappe.get_doc({
					"doctype": "Backupreport Token",
					"backupreport_instance": self.name,
					"token_id": token_id,
					"token_name": token_name,
					"active": 1 if token_data.get("active") else 0,
					"created_at": token_data.get("created_at"),
					"token_hash_preview": token_data.get("token_hash_preview", ""),
					"backup_count": token_data.get("backup_count", 0)
				})

				# Host-Bindings hinzufügen
				for host in token_data.get("allowed_hosts", []):
					pattern = host if isinstance(host, str) else host.get("hostname_pattern", str(host))
					doc.append("allowed_hosts", {"hostname_pattern": pattern})

				doc.insert(ignore_permissions=True)
				created += 1

		frappe.db.commit()
		frappe.msgprint(f"Tokens synchronisiert: {created} neu, {synced} aktualisiert")
		return {"created": created, "synced": synced}

	@frappe.whitelist()
	def create_token(self, token_name):
		"""Erstellt einen neuen Token über die API"""
		if not self.enabled:
			frappe.throw("Diese Instanz ist deaktiviert")

		if not token_name:
			frappe.throw("Bitte einen Token-Namen eingeben")

		response = self._api_request("/admin/tokens", method="POST", data={"name": token_name})
		if not response:
			frappe.throw("Konnte Token nicht erstellen")

		# Token-Wert ist nur jetzt verfügbar!
		token_value = response.get("token", "")
		token_id = response.get("token_id")

		# Lokalen Eintrag erstellen mit Token-Wert
		doc = frappe.get_doc({
			"doctype": "Backupreport Token",
			"backupreport_instance": self.name,
			"token_id": token_id,
			"token_name": token_name,
			"active": 1,
			"token_value": token_value
		})
		doc.insert(ignore_permissions=True)
		frappe.db.commit()

		# Token-Wert zurückgeben (wird im Dialog angezeigt)
		return {
			"token_name": token_name,
			"token_value": token_value,
			"warning": "Der Token wurde gespeichert. Du kannst ihn jederzeit im Token-Dokument abrufen."
		}

	def _create_log(self, backup_data):
		"""Erstellt einen Backupreport Log Eintrag"""
		log_content = backup_data.get("log_content", "")
		log_type = backup_data.get("log_type", "")

		# JSON-Felder extrahieren
		json_fields = self._parse_json_log(log_content) if log_type == "json" else {}

		# Log-Content als String speichern
		if isinstance(log_content, dict):
			log_content_str = json.dumps(log_content, indent=2, ensure_ascii=False)
		else:
			log_content_str = str(log_content) if log_content else ""

		# Backup-Type: Priorität API-Daten, dann aus JSON-Content extrahieren
		backup_type = backup_data.get("backup_type")
		if not backup_type and isinstance(log_content, dict):
			backup_type = log_content.get("backup_type")

		doc = frappe.get_doc({
			"doctype": "Backupreport Log",
			"backupreport_instance": self.name,
			"backup_id": backup_data.get("id"),
			"hostname": backup_data.get("hostname"),
			"backup_type": backup_type,
			"log_type": log_type,
			"token_name": backup_data.get("token_name"),
			"backup_date": backup_data.get("created_at"),
			"size": backup_data.get("size", 0),
			"log_content": log_content_str,
			**json_fields
		})
		doc.insert(ignore_permissions=True)
		return doc

	def _parse_json_log(self, log_content):
		"""Extrahiert Felder aus JSON-Logs"""
		if not isinstance(log_content, dict):
			return {}

		# Default-Werte für alle Felder
		result = {
			"success": 0,
			"file_size_mb": 0,
			"duration_seconds": 0,
			"errors": 0,
			"warnings": 0
		}

		backup_type = log_content.get("backup_type", "")

		# rsync-to-usb-v1 Format
		if backup_type == "rsync-to-usb-v1":
			result["success"] = 1 if log_content.get("status") == "success" else 0

			backup_info = log_content.get("backup", {})
			if backup_info:
				# Duration: try total_duration_seconds first, fallback to duration_seconds
				result["duration_seconds"] = (
					backup_info.get("total_duration_seconds") or
					backup_info.get("duration_seconds") or 0
				)

				# Parse file size from rsync_stats if available
				rsync_stats = backup_info.get("rsync_stats", "")
				if rsync_stats:
					import re
					# Try "Total transferred:" first, fallback to "Total file size:"
					match = re.search(r"Total transferred:\s*([\d,]+)", rsync_stats)
					if not match:
						match = re.search(r"Total file size:\s*([\d,]+)", rsync_stats)
					if match:
						bytes_str = match.group(1).replace(",", "")
						result["file_size_mb"] = int(bytes_str) / (1024 * 1024)

			# Warnings from array
			result["warnings"] = len(log_content.get("warnings", []))
			result["errors"] = 1 if log_content.get("error_message") else 0

		# snapcontrol-v1 / differential / full Format
		else:
			backup_info = log_content.get("backup", {})
			if backup_info:
				result["success"] = 1 if backup_info.get("success") else 0
				# Bytes zu MB konvertieren (vermeidet Integer-Overflow bei großen Backups)
				file_size_bytes = backup_info.get("file_size_bytes", 0) or 0
				result["file_size_mb"] = file_size_bytes / (1024 * 1024)
				result["duration_seconds"] = backup_info.get("duration_seconds", 0) or 0

			# Log-Summary extrahieren
			log_summary = log_content.get("log_summary", {})
			if log_summary:
				result["errors"] = log_summary.get("errors", 0) or 0
				result["warnings"] = log_summary.get("warnings", 0) or 0

		return result


def sync_all_instances():
	"""Scheduled Task: Synchronisiert alle aktiven Backupreport Instances (stündlich)"""
	instances = frappe.get_all(
		"Backupreport Instance",
		filters={"enabled": 1},
		pluck="name"
	)

	total_new = 0
	for instance_name in instances:
		try:
			doc = frappe.get_doc("Backupreport Instance", instance_name)
			new_backups = doc.fetch_backups()
			doc.last_sync = now_datetime()
			doc.save()
			total_new += new_backups
			frappe.db.commit()
		except Exception as e:
			frappe.log_error(
				f"Backupreport Sync failed for {instance_name}: {str(e)}",
				"Backupreport Scheduled Sync"
			)

	if total_new > 0:
		frappe.logger().info(f"Backupreport: {total_new} neue Logs synchronisiert")
