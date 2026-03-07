// Copyright (c) 2026, itsdave GmbH and contributors
// For license information, please see license.txt

frappe.ui.form.on("Backupreport Log", {
	refresh(frm) {
		frm.trigger("render_visualization");
	},

	render_visualization(frm) {
		if (!frm.doc.log_content || !frm.doc.backup_type) {
			frm.set_df_property("visualization_html", "options", "");
			return;
		}

		let html = "";

		// Visualisierung basierend auf backup_type
		if (frm.doc.backup_type === "snapcontrol-v1" || frm.doc.backup_type === "differential" || frm.doc.backup_type === "full") {
			html = frm.events.render_snapcontrol_v1(frm);
		} else if (frm.doc.backup_type === "rsync-to-usb-v1") {
			html = frm.events.render_rsync_to_usb_v1(frm);
		} else if (frm.doc.log_type === "json") {
			// Generische JSON-Visualisierung
			html = frm.events.render_generic_json(frm);
		} else {
			// Kein spezielles Rendering
			html = `<div class="text-muted">Keine Visualisierung für Typ "${frm.doc.backup_type}" verfügbar.</div>`;
		}

		frm.set_df_property("visualization_html", "options", html);
	},

	render_snapcontrol_v1(frm) {
		let data;
		try {
			data = JSON.parse(frm.doc.log_content);
		} catch (e) {
			return `<div class="alert alert-danger">JSON Parse Error: ${e.message}</div>`;
		}

		const backup = data.backup || {};
		const storage = data.storage || {};
		const target_disk = data.target_disk || {};
		const log_summary = data.log_summary || {};
		const log_entries = data.log_entries || [];

		// Status Badge
		const status_color = backup.success ? "green" : "red";
		const status_text = backup.success ? "Erfolgreich" : "Fehlgeschlagen";
		const status_icon = backup.success ? "fa-check-circle" : "fa-times-circle";

		// Differential Info
		let diff_info_html = "";
		if (backup.differential_info) {
			const diff = backup.differential_info;
			const progress_percent = (diff.current / diff.max) * 100;
			diff_info_html = `
				<div class="mt-3">
					<label class="text-muted">Differential Zyklus</label>
					<div class="progress" style="height: 20px;">
						<div class="progress-bar bg-info" style="width: ${progress_percent}%">
							${diff.current} / ${diff.max}
						</div>
					</div>
					<small class="text-muted">Nächstes Full-Backup in ${diff.next_full_in} Zyklen</small>
				</div>
			`;
		}

		// Storage Info
		let storage_html = "";
		if (storage.total_bytes > 0) {
			const used_percent = ((storage.total_bytes - storage.free_bytes) / storage.total_bytes * 100).toFixed(1);
			const free_gb = (storage.free_bytes / 1024 / 1024 / 1024).toFixed(2);
			const total_gb = (storage.total_bytes / 1024 / 1024 / 1024).toFixed(2);
			storage_html = `
				<div class="col-md-6">
					<div class="card h-100">
						<div class="card-body">
							<h6 class="card-title"><i class="fa fa-hdd-o"></i> Speicher: ${target_disk.disk_name || target_disk.drive_letter || 'N/A'}</h6>
							<div class="progress mb-2" style="height: 20px;">
								<div class="progress-bar ${used_percent > 90 ? 'bg-danger' : used_percent > 70 ? 'bg-warning' : 'bg-success'}"
									 style="width: ${used_percent}%">
									${used_percent}% belegt
								</div>
							</div>
							<small class="text-muted">${free_gb} GB frei von ${total_gb} GB</small>
							${storage.cycles_count ? `<br><small class="text-muted">Zyklen: ${storage.cycles_count} / ${storage.cycles_max}</small>` : ''}
						</div>
					</div>
				</div>
			`;
		}

		// Log Entries
		let log_entries_html = "";
		if (log_entries.length > 0) {
			const entries_list = log_entries.slice(-10).map(entry => {
				const level_class = entry.level === "ERROR" ? "danger" : entry.level === "WARNING" ? "warning" : entry.level === "SUCCESS" ? "success" : "secondary";
				return `<div class="d-flex align-items-start mb-1">
					<span class="badge badge-${level_class} mr-2" style="min-width: 60px;">${entry.level}</span>
					<small class="text-muted mr-2">${entry.timestamp ? entry.timestamp.split('T')[1]?.substring(0,8) : ''}</small>
					<span style="word-break: break-word;">${frappe.utils.escape_html(entry.message)}</span>
				</div>`;
			}).join("");

			log_entries_html = `
				<div class="col-12 mt-3">
					<div class="card">
						<div class="card-body">
							<h6 class="card-title"><i class="fa fa-list"></i> Log Einträge (letzte 10)</h6>
							<div style="max-height: 200px; overflow-y: auto; font-size: 12px;">
								${entries_list}
							</div>
						</div>
					</div>
				</div>
			`;
		}

		return `
			<style>
				.backup-viz .card { border: 1px solid var(--border-color); }
				.backup-viz .card-body { padding: 12px; }
				.backup-viz .card-title { margin-bottom: 10px; font-weight: 600; }
				.backup-viz .badge { font-size: 11px; }
			</style>
			<div class="backup-viz">
				<div class="row">
					<!-- Status Card -->
					<div class="col-md-6">
						<div class="card h-100">
							<div class="card-body">
								<div class="d-flex align-items-center mb-3">
									<i class="fa ${status_icon} fa-2x text-${status_color} mr-3"></i>
									<div>
										<h5 class="mb-0 text-${status_color}">${status_text}</h5>
										<small class="text-muted">${data.computer_name || frm.doc.hostname}</small>
									</div>
								</div>
								<table class="table table-sm table-borderless mb-0">
									<tr><td class="text-muted" style="width:40%">Typ</td><td><strong>${backup.type || frm.doc.backup_type}</strong></td></tr>
									<tr><td class="text-muted">Quelle</td><td>${backup.source || 'N/A'}</td></tr>
									<tr><td class="text-muted">Ziel</td><td>${backup.target || 'N/A'}</td></tr>
									<tr><td class="text-muted">Größe</td><td>${backup.file_size_human || '0 B'}</td></tr>
									<tr><td class="text-muted">Dauer</td><td>${backup.duration_human || '0 Sekunden'}</td></tr>
								</table>
								${diff_info_html}
							</div>
						</div>
					</div>
					${storage_html}
				</div>
				<div class="row">
					${log_entries_html}
				</div>
				${log_summary.errors > 0 || log_summary.warnings > 0 ? `
					<div class="row mt-3">
						<div class="col-12">
							<div class="alert ${log_summary.errors > 0 ? 'alert-danger' : 'alert-warning'} mb-0">
								<i class="fa fa-exclamation-triangle mr-2"></i>
								${log_summary.errors > 0 ? `<strong>${log_summary.errors} Fehler</strong>` : ''}
								${log_summary.errors > 0 && log_summary.warnings > 0 ? ' und ' : ''}
								${log_summary.warnings > 0 ? `<strong>${log_summary.warnings} Warnungen</strong>` : ''}
							</div>
						</div>
					</div>
				` : ''}
			</div>
		`;
	},

	render_rsync_to_usb_v1(frm) {
		let data;
		try {
			data = JSON.parse(frm.doc.log_content);
		} catch (e) {
			return `<div class="alert alert-danger">JSON Parse Error: ${e.message}</div>`;
		}

		const backup = data.backup || {};
		const disk = data.disk || {};
		const system = data.system || {};
		const warnings = data.warnings || [];

		// Status
		const is_success = data.status === "success";
		const status_color = is_success ? "green" : "red";
		const status_text = is_success ? "Erfolgreich" : "Fehlgeschlagen";
		const status_icon = is_success ? "fa-check-circle" : "fa-times-circle";

		// Parse rsync stats
		let rsync_stats = {};
		if (backup.rsync_stats) {
			const lines = backup.rsync_stats.split('\n');
			lines.forEach(line => {
				const match = line.match(/^- (.+?):\s*(.+)$/);
				if (match) {
					rsync_stats[match[1].toLowerCase().replace(/\s+/g, '_')] = match[2];
				}
			});
		}

		// Parse cleanup stats
		let cleanup_stats = {};
		if (backup.cleanup_stats) {
			const lines = backup.cleanup_stats.split('\n');
			lines.forEach(line => {
				const match = line.match(/^- (.+?):\s*(.+)$/);
				if (match) {
					cleanup_stats[match[1].toLowerCase().replace(/\s+/g, '_')] = match[2];
				}
			});
		}

		// Format bytes to human readable
		const formatBytes = (bytes) => {
			if (!bytes || isNaN(bytes)) return 'N/A';
			const units = ['B', 'KB', 'MB', 'GB', 'TB'];
			let i = 0;
			let value = parseFloat(bytes.toString().replace(/,/g, ''));
			while (value >= 1024 && i < units.length - 1) {
				value /= 1024;
				i++;
			}
			return value.toFixed(2) + ' ' + units[i];
		};

		// Disk rotation card
		let disk_html = "";
		if (disk.current_disk || disk.model) {
			const rotation_warning = backup.rotation_broken ?
				`<div class="alert alert-warning mb-2 p-2" style="font-size: 11px;">
					<i class="fa fa-exclamation-triangle mr-1"></i>
					${frappe.utils.escape_html(backup.rotation_message || 'Rotation unterbrochen')}
				</div>` : '';

			disk_html = `
				<div class="col-md-6 mb-3">
					<div class="card h-100">
						<div class="card-body">
							<h6 class="card-title"><i class="fa fa-usb"></i> USB-Laufwerk</h6>
							${rotation_warning}
							<table class="table table-sm table-borderless mb-0" style="font-size: 12px;">
								<tr><td class="text-muted" style="width:40%">Aktuell</td><td><strong>${disk.current_disk?.name || 'N/A'}</strong></td></tr>
								<tr><td class="text-muted">Nächste</td><td>${disk.next_disk?.name || 'N/A'}</td></tr>
								<tr><td class="text-muted">Modell</td><td>${disk.model || 'N/A'}</td></tr>
								<tr><td class="text-muted">Kapazität</td><td>${disk.capacity || 'N/A'}</td></tr>
								<tr><td class="text-muted">Serial</td><td><code style="font-size: 10px;">${disk.serial || 'N/A'}</code></td></tr>
							</table>
						</div>
					</div>
				</div>
			`;
		}

		// Timing card
		let timing_html = `
			<div class="col-md-6 mb-3">
				<div class="card h-100">
					<div class="card-body">
						<h6 class="card-title"><i class="fa fa-clock-o"></i> Zeitablauf</h6>
						<table class="table table-sm table-borderless mb-0" style="font-size: 12px;">
							<tr><td class="text-muted" style="width:40%">Start</td><td>${backup.start_time || 'N/A'}</td></tr>
							<tr><td class="text-muted">Ende</td><td>${backup.end_time || 'N/A'}</td></tr>
							<tr><td class="text-muted">Rsync</td><td><strong>${backup.duration || 'N/A'}</strong></td></tr>
							<tr><td class="text-muted">Monitoring</td><td>${backup.monitoring_duration || 'N/A'}</td></tr>
							<tr><td class="text-muted">Cleanup</td><td>${backup.cleanup_duration || 'N/A'}</td></tr>
							<tr><td class="text-muted">Gesamt</td><td><strong>${backup.total_duration || 'N/A'}</strong></td></tr>
						</table>
					</div>
				</div>
			</div>
		`;

		// Rsync statistics card
		let rsync_html = "";
		if (Object.keys(rsync_stats).length > 0) {
			rsync_html = `
				<div class="col-md-6 mb-3">
					<div class="card h-100">
						<div class="card-body">
							<h6 class="card-title"><i class="fa fa-exchange"></i> Rsync Statistik</h6>
							<table class="table table-sm table-borderless mb-0" style="font-size: 12px;">
								<tr><td class="text-muted" style="width:50%">Dateien</td><td>${rsync_stats.number_of_files || 'N/A'}</td></tr>
								<tr><td class="text-muted">Erstellt</td><td>${rsync_stats.created_files || '0'}</td></tr>
								<tr><td class="text-muted">Gelöscht</td><td>${rsync_stats.deleted_files || '0'}</td></tr>
								<tr><td class="text-muted">Übertragen</td><td>${formatBytes(rsync_stats.total_transferred)}</td></tr>
								<tr><td class="text-muted">Geschwindigkeit</td><td>${rsync_stats.transfer_speed || 'N/A'}</td></tr>
							</table>
						</div>
					</div>
				</div>
			`;
		}

		// Cleanup statistics card
		let cleanup_html = "";
		if (Object.keys(cleanup_stats).length > 0) {
			cleanup_html = `
				<div class="col-md-6 mb-3">
					<div class="card h-100">
						<div class="card-body">
							<h6 class="card-title"><i class="fa fa-trash"></i> Aufräumen</h6>
							<table class="table table-sm table-borderless mb-0" style="font-size: 12px;">
								<tr><td class="text-muted" style="width:50%">Aktiviert</td><td>${cleanup_stats.cleanup_enabled || 'N/A'}</td></tr>
								<tr><td class="text-muted">Dateien gelöscht</td><td>${cleanup_stats.files_deleted || '0'}</td></tr>
								<tr><td class="text-muted">Fehlgeschlagen</td><td>${cleanup_stats.failed_deletions || '0'}</td></tr>
								<tr><td class="text-muted">Platz freigegeben</td><td><strong>${cleanup_stats.space_freed || 'N/A'}</strong></td></tr>
							</table>
						</div>
					</div>
				</div>
			`;
		}

		// System info card
		let system_html = "";
		if (system.cpu_info || system.memory_total) {
			system_html = `
				<div class="col-md-6 mb-3">
					<div class="card h-100">
						<div class="card-body">
							<h6 class="card-title"><i class="fa fa-server"></i> System</h6>
							<table class="table table-sm table-borderless mb-0" style="font-size: 12px;">
								<tr><td class="text-muted" style="width:40%">CPU</td><td>${system.cpu_info || 'N/A'} (${system.cpu_percent || 'N/A'})</td></tr>
								<tr><td class="text-muted">Speicher</td><td>${system.memory_used || 'N/A'} / ${system.memory_total || 'N/A'} (${system.memory_percent || 'N/A'})</td></tr>
								<tr><td class="text-muted">Storage</td><td>${system.system_storage || 'N/A'}</td></tr>
								<tr><td class="text-muted">Quelle</td><td>${system.source_size || 'N/A'}</td></tr>
								<tr><td class="text-muted">Uptime</td><td>${system.uptime || 'N/A'}</td></tr>
							</table>
						</div>
					</div>
				</div>
			`;
		}

		// Warnings section
		let warnings_html = "";
		if (warnings.length > 0) {
			const warning_items = warnings.map(w =>
				`<div class="mb-1"><i class="fa fa-exclamation-triangle text-warning mr-1"></i> ${frappe.utils.escape_html(w)}</div>`
			).join("");
			warnings_html = `
				<div class="col-12 mb-3">
					<div class="alert alert-warning mb-0" style="font-size: 12px;">
						<strong><i class="fa fa-exclamation-triangle mr-1"></i> ${warnings.length} Warnung(en)</strong>
						<div class="mt-2">${warning_items}</div>
					</div>
				</div>
			`;
		}

		// Error section
		let error_html = "";
		if (data.error_message) {
			error_html = `
				<div class="col-12 mb-3">
					<div class="alert alert-danger mb-0" style="font-size: 12px;">
						<strong><i class="fa fa-times-circle mr-1"></i> Fehler</strong>
						<div class="mt-2">${frappe.utils.escape_html(data.error_message)}</div>
					</div>
				</div>
			`;
		}

		return `
			<style>
				.backup-viz .card { border: 1px solid var(--border-color); }
				.backup-viz .card-body { padding: 12px; }
				.backup-viz .card-title { margin-bottom: 10px; font-weight: 600; }
			</style>
			<div class="backup-viz">
				<div class="row">
					<!-- Status Card -->
					<div class="col-md-6 mb-3">
						<div class="card h-100">
							<div class="card-body">
								<div class="d-flex align-items-center mb-3">
									<i class="fa ${status_icon} fa-2x text-${status_color} mr-3"></i>
									<div>
										<h5 class="mb-0 text-${status_color}">${status_text}</h5>
										<small class="text-muted">${data.computer_name || frm.doc.hostname}</small>
									</div>
								</div>
								<table class="table table-sm table-borderless mb-0" style="font-size: 12px;">
									<tr><td class="text-muted" style="width:40%">Typ</td><td><strong>Rsync to USB</strong></td></tr>
									<tr><td class="text-muted">Quelle</td><td>${backup.source_directory || 'N/A'}</td></tr>
									<tr><td class="text-muted">Ziel</td><td>${backup.destination || 'N/A'}</td></tr>
									<tr><td class="text-muted">Zeitstempel</td><td>${data.timestamp ? data.timestamp.replace('T', ' ').substring(0, 19) : 'N/A'}</td></tr>
								</table>
							</div>
						</div>
					</div>
					${disk_html}
				</div>
				<div class="row">
					${timing_html}
					${rsync_html}
				</div>
				<div class="row">
					${cleanup_html}
					${system_html}
				</div>
				<div class="row">
					${warnings_html}
					${error_html}
				</div>
			</div>
		`;
	},

	render_generic_json(frm) {
		let data;
		try {
			data = JSON.parse(frm.doc.log_content);
		} catch (e) {
			return `<div class="alert alert-danger">JSON Parse Error: ${e.message}</div>`;
		}

		return `
			<div class="alert alert-info">
				<i class="fa fa-info-circle mr-2"></i>
				Backup Type: <strong>${frm.doc.backup_type || 'unbekannt'}</strong> -
				Keine spezifische Visualisierung vorhanden.
			</div>
		`;
	}
});
