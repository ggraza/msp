// Copyright (c) 2023, itsdave GmbH and contributors
// For license information, please see license.txt


frappe.ui.form.on('MSP Documentation', {
	refresh(frm) {
		// Check NAT availability on form load
		frm.trigger('check_nat_availability');

		// Render Windows Update Report from JSON data
		frm.trigger('render_windows_update_report');

		// Workflow buttons
		frm.add_custom_button('1. Get Tactical Agents', function(){
			frappe.dom.freeze('Fetching Tactical Agents...');
			frappe.call({
				method: 'msp.tactical-rmm.get_agents_pretty',
				args: { documentation: frm.doc.name },
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Error'),
							indicator: 'red',
							message: __('Failed to fetch tactical agents. Please try again.')
						});
						return;
					}
					frappe.show_alert({
						message: __('Successfully fetched tactical agents'),
						indicator: 'green'
					});
					frm.reload_doc();
				}
			});
		}, 'Workflow');

		frm.add_custom_button('2. Office Search', function(){
			frappe.dom.freeze('Searching for Office installations...');
			frappe.call({
				method: 'msp.tactical-rmm.search_office',
				args: { documentation_name: frm.doc.name },
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Error'),
							indicator: 'red',
							message: __('Failed to complete Office search. Please try again.')
						});
						return;
					}
					frappe.show_alert({
						message: __('Office search completed'),
						indicator: 'green'
					});
					frm.reload_doc();
				}
			});
		}, 'Workflow');

		// Add new button for IT Objects documentation
		frm.add_custom_button('3. Generate IT Objects', function(){
			frappe.dom.freeze('Generating IT Objects documentation...');
			frappe.call({
				method: 'msp.tools.get_documentation_html',
				args: {
					it_landscape: frm.doc.landscape
				},
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Error'),
							indicator: 'red',
							message: __('Failed to generate IT Objects documentation. Please try again.')
						});
						return;
					}
					if (r.message) {
						frm.set_value('it_objects', r.message);
						frm.save().then(() => {
							frappe.show_alert({
								message: __('IT Objects documentation generated successfully'),
								indicator: 'green'
							});
						});
					}
				}
			});
		}, 'Workflow');

		// Add button to fetch and store all RMM agent data as JSON
		frm.add_custom_button('4. RMM Daten speichern', function(){
			frappe.dom.freeze('RMM-Daten werden abgerufen und gespeichert...');
			frappe.call({
				method: 'msp.tactical-rmm.fetch_and_store_all_agent_data',
				args: {
					documentation_name: frm.doc.name
				},
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Fehler'),
							indicator: 'red',
							message: __('RMM-Daten konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.')
						});
						return;
					}
					if (r.message && r.message.success) {
						frappe.show_alert({
							message: r.message.message || __('RMM-Daten erfolgreich gespeichert'),
							indicator: 'green'
						});
						frm.reload_doc();
					}
				}
			});
		}, 'Workflow');

		// Add button to import IT Objects from RMM
		if (frm.doc.tactical_rmm_tenant_caption) {
			frm.add_custom_button(__('IT Objects aus RMM importieren'), function(){
				frappe.dom.freeze('Import-Session wird erstellt...');
				frappe.call({
					method: 'msp.rmm_import.create_import_session',
					args: {
						documentation_name: frm.doc.name
					},
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.exc) {
							frappe.msgprint({
								title: __('Fehler'),
								indicator: 'red',
								message: __('Import-Session konnte nicht erstellt werden. Bitte versuchen Sie es erneut.')
							});
							return;
						}
						if (r.message) {
							frappe.set_route('Form', 'RMM Import Session', r.message);
						}
					}
				});
			}, __('RMM'));

			// Add button to match existing IT Objects with RMM agents
			frm.add_custom_button(__('IT Objects mit RMM verknüpfen'), function(){
				frappe.dom.freeze('Lade Matching-Vorschläge...');
				frappe.call({
					method: 'msp.rmm_import.get_matching_suggestions',
					args: {
						documentation_name: frm.doc.name
					},
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.exc) {
							frappe.msgprint({
								title: __('Fehler'),
								indicator: 'red',
								message: __('Matching-Vorschläge konnten nicht geladen werden.')
							});
							return;
						}
						if (r.message) {
							show_rmm_matching_dialog(frm, r.message);
						}
					}
				});
			}, __('RMM'));
		}

		// Add connectivity test button before AD operations
		frm.add_custom_button('🔌 Konnektivitätstest', function(){
			// Create and show dialog immediately with pending status
			let dialog = new frappe.ui.Dialog({
				title: 'LDAP-Konnektivitätstest',
				size: 'large',
				fields: [
					{
						fieldtype: 'HTML',
						fieldname: 'test_results',
						options: `
							<div class="connectivity-test-container" style="font-family: var(--font-stack); padding: 15px;">
								<div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
									<div style="font-size: 14px; color: #6c757d;">Ziel-IP:</div>
									<div class="target-ip" style="font-size: 18px; font-weight: bold;">Wird ermittelt...</div>
								</div>

								<div class="test-ping connectivity-test-item" style="margin-bottom: 15px; padding: 15px; border: 1px solid #dee2e6; border-radius: 8px;">
									<div style="display: flex; align-items: center; gap: 12px;">
										<div class="ping-icon" style="font-size: 24px;">⏳</div>
										<div style="flex: 1;">
											<div style="font-weight: bold; font-size: 14px;">1. Ping-Test</div>
											<div class="ping-message" style="color: #6c757d; font-size: 13px;">Test wird ausgeführt...</div>
										</div>
										<div class="ping-duration" style="font-size: 12px; color: #6c757d;"></div>
									</div>
								</div>

								<div class="test-port connectivity-test-item" style="margin-bottom: 15px; padding: 15px; border: 1px solid #dee2e6; border-radius: 8px;">
									<div style="display: flex; align-items: center; gap: 12px;">
										<div class="port-icon" style="font-size: 24px;">⏳</div>
										<div style="flex: 1;">
											<div style="font-weight: bold; font-size: 14px;">2. Port-Test (LDAP 389)</div>
											<div class="port-message" style="color: #6c757d; font-size: 13px;">Wartet auf Ping...</div>
										</div>
										<div class="port-duration" style="font-size: 12px; color: #6c757d;"></div>
									</div>
								</div>

								<div class="test-ldap connectivity-test-item" style="margin-bottom: 15px; padding: 15px; border: 1px solid #dee2e6; border-radius: 8px;">
									<div style="display: flex; align-items: center; gap: 12px;">
										<div class="ldap-icon" style="font-size: 24px;">⏳</div>
										<div style="flex: 1;">
											<div style="font-weight: bold; font-size: 14px;">3. LDAP-Authentifizierung</div>
											<div class="ldap-message" style="color: #6c757d; font-size: 13px;">Wartet auf Port-Test...</div>
										</div>
										<div class="ldap-duration" style="font-size: 12px; color: #6c757d;"></div>
									</div>
								</div>

								<div class="overall-status" style="margin-top: 20px; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; display: none;">
								</div>
							</div>
						`
					}
				],
				primary_action_label: 'Schließen',
				primary_action: function() {
					dialog.hide();
				}
			});
			dialog.show();

			// Get reference to this dialog's wrapper for scoped selectors
			const $wrapper = dialog.$wrapper;

			// Helper function to update test status (scoped to this dialog)
			function updateTestStatus(testId, status, message, duration) {
				const iconMap = {
					'pending': '⏳',
					'success': '✅',
					'error': '❌',
					'skipped': '⏭️'
				};
				const colorMap = {
					'pending': '#dee2e6',
					'success': '#d4edda',
					'error': '#f8d7da',
					'skipped': '#fff3cd'
				};

				$wrapper.find(`.${testId}-icon`).text(iconMap[status] || '❓');
				$wrapper.find(`.${testId}-message`).text(message);
				$wrapper.find(`.test-${testId}`).css('background', colorMap[status] || '#f8f9fa');

				if (duration !== null && duration !== undefined) {
					$wrapper.find(`.${testId}-duration`).text(`${duration} ms`);
				}
			}

			// Run the connectivity test
			frappe.call({
				method: 'msp.tactical-rmm.test_ldap_connectivity',
				args: { documentation_name: frm.doc.name },
				callback: function(r) {
					if (r.exc || !r.message) {
						$wrapper.find('.target-ip').text('Fehler');
						updateTestStatus('ping', 'error', 'Test konnte nicht ausgeführt werden', null);
						return;
					}

					const result = r.message;

					// Update target IP
					$wrapper.find('.target-ip').text(result.ip_address || 'Nicht konfiguriert');

					// Update each test
					const tests = result.tests || {};

					// Ping
					if (tests.ping) {
						updateTestStatus('ping', tests.ping.status, tests.ping.message, tests.ping.duration_ms);
					}

					// Port
					if (tests.port) {
						updateTestStatus('port', tests.port.status, tests.port.message, tests.port.duration_ms);
					}

					// LDAP Bind
					if (tests.ldap_bind) {
						updateTestStatus('ldap', tests.ldap_bind.status, tests.ldap_bind.message, tests.ldap_bind.duration_ms);
					}

					// Overall status
					const $statusEl = $wrapper.find('.overall-status');
					$statusEl.show();

					if (result.overall_status === 'success') {
						$statusEl.css('background', '#d4edda').css('color', '#155724');
						$statusEl.text('✅ Alle Tests erfolgreich - LDAP-Verbindung bereit');
					} else if (result.overall_status === 'partial') {
						$statusEl.css('background', '#fff3cd').css('color', '#856404');
						$statusEl.text('⚠️ Teilweise erfolgreich - Einige Tests fehlgeschlagen');
					} else {
						$statusEl.css('background', '#f8d7da').css('color', '#721c24');
						$statusEl.text('❌ Verbindung fehlgeschlagen');
					}
				}
			});
		}, 'Diagnose');

		// Add button to fetch and store Active Directory computer data as JSON
		frm.add_custom_button('5. AD Computer-Daten speichern', function(){
			frappe.dom.freeze('AD-Computer-Daten werden abgerufen und gespeichert...');
			frappe.call({
				method: 'msp.tactical-rmm.fetch_and_store_ad_computer_data',
				args: {
					documentation_name: frm.doc.name
				},
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Fehler'),
							indicator: 'red',
							message: __('AD-Computer-Daten konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.')
						});
						return;
					}
					if (r.message && r.message.success) {
						frappe.show_alert({
							message: r.message.message || __('AD-Computer-Daten erfolgreich gespeichert'),
							indicator: 'green'
						});
						frm.reload_doc();
					}
				}
			});
		}, 'Workflow');

		// Add button to fetch and store Active Directory user data as JSON
		frm.add_custom_button('6. AD Benutzer-Daten speichern', function(){
			frappe.dom.freeze('AD-Benutzer-Daten werden abgerufen und gespeichert...');
			frappe.call({
				method: 'msp.tactical-rmm.fetch_and_store_ad_user_data',
				args: {
					documentation_name: frm.doc.name
				},
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Fehler'),
							indicator: 'red',
							message: __('AD-Benutzer-Daten konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.')
						});
						return;
					}
					if (r.message && r.message.success) {
						frappe.show_alert({
							message: r.message.message || __('AD-Benutzer-Daten erfolgreich gespeichert'),
							indicator: 'green'
						});
						frm.reload_doc();
					}
				}
			});
		}, 'Workflow');

		// Add button to compare RMM and AD data
		frm.add_custom_button('7. RMM ↔ AD Abgleich', function(){
			frappe.dom.freeze('RMM- und AD-Daten werden abgeglichen...');
			frappe.call({
				method: 'msp.tactical-rmm.compare_rmm_and_ad_data',
				args: {
					documentation_name: frm.doc.name
				},
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Fehler'),
							indicator: 'red',
							message: __('Datenabgleich konnte nicht durchgeführt werden. Bitte versuchen Sie es erneut.')
						});
						return;
					}
					if (r.message && r.message.success) {
						let stats = r.message.stats;
						let details = `${stats.total_computers} Computer analysiert: ` +
									`${stats.in_both} in beiden Systemen, ` +
									`${stats.only_in_rmm} nur RMM, ` +
									`${stats.only_in_ad} nur AD`;

						frappe.show_alert({
							message: __('Datenabgleich erfolgreich abgeschlossen. ') + details,
							indicator: 'green'
						});
						frm.reload_doc();
					}
				}
			});
		}, 'Workflow');

		// Add button for Windows 11 compatibility check
		frm.add_custom_button('8. Windows 11 Check', function(){
			frappe.dom.freeze('Windows 11 CPU-Kompatibilität wird geprüft...');
			frappe.call({
				method: 'msp.tactical-rmm.check_windows11_compatibility',
				args: {
					documentation_name: frm.doc.name
				},
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Fehler'),
							indicator: 'red',
							message: __('Windows 11 Kompatibilitätsprüfung konnte nicht durchgeführt werden. Bitte versuchen Sie es erneut.')
						});
						return;
					}
					if (r.message && r.message.success) {
						let stats = r.message.stats;
						let details = `${stats.total_non_win11} Systeme ohne Windows 11 analysiert: ` +
									`${stats.compatible_cpus} kompatible CPUs, ` +
									`${stats.incompatible_cpus} inkompatible CPUs, ` +
									`${stats.unknown_cpus} unbekannte CPUs`;

						frappe.show_alert({
							message: __('Windows 11 Kompatibilitätsprüfung abgeschlossen. ') + details,
							indicator: 'green'
						});
						frm.reload_doc();
					}
				}
			});
		}, 'Workflow');

		// Add button for Windows Update status report
		frm.add_custom_button('9. Windows Updates', function(){
			frappe.dom.freeze('Windows Update Status wird abgerufen...');
			frappe.call({
				method: 'msp.tactical-rmm.fetch_windows_update_data',
				args: {
					documentation_name: frm.doc.name
				},
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Fehler'),
							indicator: 'red',
							message: __('Windows Update Status konnte nicht abgerufen werden. Bitte versuchen Sie es erneut.')
						});
						return;
					}
					if (r.message && r.message.success) {
						let totals = r.message.totals;
						let score = r.message.compliance_score;
						let status = r.message.compliance_status;

						let indicator = status === 'green' ? 'green' : status === 'yellow' ? 'orange' : 'red';
						let statusText = status === 'green' ? 'Gut' : status === 'yellow' ? 'Warnung' : 'Kritisch';

						let details = `${r.message.agent_count} Computer analysiert: ` +
									`Compliance ${score}% (${statusText}) - ` +
									`${totals.installed} installiert, ` +
									`${totals.pending} ausstehend, ` +
									`${totals.failed} fehlgeschlagen`;

						frappe.show_alert({
							message: __('Windows Update Status abgerufen. ') + details,
							indicator: indicator
						});
						frm.reload_doc();
					}
				}
			});
		}, 'Workflow');

		// Add debug button for CPU compatibility
		frm.add_custom_button('🔍 CPU Debug', function(){
			frappe.prompt([
				{
					'fieldname': 'test_cpu',
					'label': 'Test CPU (leer = automatisch)',
					'fieldtype': 'Data',
					'reqd': 0,
					'description': 'Z.B: Intel(R) Core(TM) i3-8100 CPU @ 3.60GHz, 4C/4T'
				}
			], function(values) {
				frappe.dom.freeze('CPU-Kompatibilität wird debuggt...');
				frappe.call({
					method: 'msp.tactical-rmm.debug_cpu_compatibility',
					args: {
						documentation_name: frm.doc.name,
						test_cpu_string: values.test_cpu || null
					},
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.exc) {
							frappe.msgprint({
								title: __('Fehler'),
								indicator: 'red',
								message: __('CPU-Debug konnte nicht durchgeführt werden: ') + r.exc
							});
							return;
						}
						if (r.message && r.message.success) {
							let debug_info = r.message.debug_info;
							let result = r.message.result;
							let test_cpu = r.message.test_cpu;

							// Debug-Dialog erstellen
							let debug_html = `
								<div style="font-family: monospace; font-size: 12px;">
									<h4>🔍 CPU-Kompatibilitäts Debug</h4>
									<div><strong>Test-CPU:</strong> ${test_cpu}</div>
									<div><strong>System-CPU (uppercase):</strong> ${debug_info.system_cpu_upper || 'N/A'}</div>
									<div><strong>Vendor:</strong> ${debug_info.vendor || 'N/A'}</div>
									<div><strong>Suchset-Größe:</strong> ${debug_info.search_set_size || 0}</div>
									<div><strong>Ergebnis:</strong> <span style="color: ${result.compatible ? 'green' : 'red'}">
										${result.compatible ? '✅ KOMPATIBEL' : '❌ NICHT KOMPATIBEL'} (${result.status})
									</span></div>
									${debug_info.match_found ? `<div><strong>Gefundene CPU:</strong> ${debug_info.matching_cpu}</div>` : ''}

									<h5>📁 Dateipfad-Informationen:</h5>
									<div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
										<div><strong>App-Pfad:</strong> ${debug_info.app_path || 'N/A'}</div>
										${debug_info.files_info ? Object.keys(debug_info.files_info).map(vendor => {
											const info = debug_info.files_info[vendor];
											const statusColor = info.exists ? 'green' : 'red';
											const statusIcon = info.exists ? '✅' : '❌';
											return `
												<div style="margin-top: 8px;">
													<div><strong>${vendor.toUpperCase()} CPUs:</strong> ${statusIcon}</div>
													<div style="font-size: 11px; color: #666; margin-left: 10px;">
														Pfad: ${info.path}<br>
														Existiert: <span style="color: ${statusColor}">${info.exists ? 'Ja' : 'Nein'}</span><br>
														${info.exists ? `Dateigröße: ${info.size} Bytes` : ''}
													</div>
												</div>
											`;
										}).join('') : 'Keine Dateipfad-Informationen verfügbar'}
										${debug_info.loaded_counts ? `
											<div style="margin-top: 8px;">
												<strong>Geladene CPUs:</strong>
												AMD: ${debug_info.loaded_counts.amd},
												Intel: ${debug_info.loaded_counts.intel}
											</div>
										` : ''}
										${debug_info.error ? `
											<div style="color: red; margin-top: 8px;">
												<strong>Fehler:</strong> ${debug_info.error}
											</div>
										` : ''}
									</div>

									<h5>🔎 Vergleiche (erste ${debug_info.comparisons ? debug_info.comparisons.length : 0}):</h5>
									<div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px;">
							`;

							if (debug_info.comparisons) {
								debug_info.comparisons.forEach((comp, i) => {
									let color = comp.match_result ? 'green' : '#666';
									let icon = comp.match_result ? '✅' : '❌';
									debug_html += `
										<div style="margin-bottom: 8px; padding: 5px; border-left: 3px solid ${color};">
											<div><strong>${icon} ${comp.match_type}:</strong> ${comp.supported_cpu}</div>
											${comp.extracted_part ? `<div><em>Extrahiert:</em> ${comp.extracted_part}</div>` : ''}
											<div><em>Details:</em> ${comp.details}</div>
										</div>
									`;
								});
							}

							if (debug_info.truncated) {
								debug_html += '<div style="color: orange;"><em>... weitere Vergleiche abgeschnitten ...</em></div>';
							}

							debug_html += `
									</div>
								</div>
							`;

							frappe.msgprint({
								title: 'CPU-Kompatibilitäts Debug',
								message: debug_html,
								indicator: result.compatible ? 'green' : 'red'
							});
						}
					}
				});
			}, 'CPU Debug Test', 'Testen');
		}, 'Workflow');

		// Add Excel Export button
		frm.add_custom_button('📊 Excel Export', function(){
			frappe.dom.freeze('Excel-Export wird erstellt...');
			frappe.call({
				method: 'msp.tactical-rmm.export_tables_to_excel',
				args: {
					documentation_name: frm.doc.name
				},
				callback: function(r) {
					frappe.dom.unfreeze();
					if (r.exc) {
						frappe.msgprint({
							title: __('Fehler'),
							indicator: 'red',
							message: __('Excel-Export konnte nicht erstellt werden: ') + r.exc
						});
						return;
					}
					if (r.message && r.message.success) {
						let filename = r.message.filename;
						let content = r.message.content;

						// Excel-Datei herunterladen
						try {
							// Base64 zu Blob konvertieren
							const byteCharacters = atob(content);
							const byteNumbers = new Array(byteCharacters.length);
							for (let i = 0; i < byteCharacters.length; i++) {
								byteNumbers[i] = byteCharacters.charCodeAt(i);
							}
							const byteArray = new Uint8Array(byteNumbers);
							const blob = new Blob([byteArray], {
								type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
							});

							// Download-Link erstellen
							const url = window.URL.createObjectURL(blob);
							const a = document.createElement('a');
							const timestamp = new Date().toLocaleString('de-DE');
							a.style.display = 'none';
							a.href = url;
							a.download = filename;
							document.body.appendChild(a);
							a.click();
							window.URL.revokeObjectURL(url);
							document.body.removeChild(a);

							frappe.show_alert({
								message: __('Excel-Export erfolgreich heruntergeladen: ') + filename,
								indicator: 'green'
							});

						} catch (download_error) {
							console.error('Download-Fehler:', download_error);
							frappe.msgprint({
								title: __('Download-Fehler'),
								indicator: 'red',
								message: __('Die Excel-Datei konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.')
							});
						}

					}
				}
			});
		}, 'Export');
	},

	domain_controller_for_ldap_acquisition(frm) {
		frm.trigger('check_nat_availability');
		frm.trigger('update_ip_address');
	},

	use_nat_address(frm) {
		frm.trigger('update_ip_address');
	},

	check_nat_availability(frm) {
		// Hide checkbox if no DC selected
		if (!frm.doc.domain_controller_for_ldap_acquisition) {
			frm.set_df_property('use_nat_address', 'hidden', 1);
			if (frm.doc.use_nat_address) {
				frm.set_value('use_nat_address', 0);
			}
			return;
		}

		// Check if NAT network is configured
		frappe.call({
			method: 'msp.msp.doctype.msp_documentation.msp_documentation.check_nat_available',
			args: { it_object_name: frm.doc.domain_controller_for_ldap_acquisition },
			callback: function(r) {
				if (r.message) {
					frm.set_df_property('use_nat_address', 'hidden', !r.message.nat_available);
					if (!r.message.nat_available && frm.doc.use_nat_address) {
						frm.set_value('use_nat_address', 0);
					}
				}
			}
		});
	},

	update_ip_address(frm) {
		// Don't auto-update if no DC selected
		if (!frm.doc.domain_controller_for_ldap_acquisition) {
			return;
		}

		// Get effective IP address (original or NAT)
		frappe.call({
			method: 'msp.msp.doctype.msp_documentation.msp_documentation.get_effective_ip',
			args: {
				it_object_name: frm.doc.domain_controller_for_ldap_acquisition,
				use_nat: frm.doc.use_nat_address ? 1 : 0
			},
			callback: function(r) {
				if (r.message && r.message.ip_address) {
					frm.set_value('ip_address', r.message.ip_address);
				}
			}
		});
	},

	render_windows_update_report(frm) {
		// Render Windows Update Report from stored JSON data
		if (!frm.doc.windows_update_data_json) {
			// No data yet - show placeholder
			frm.fields_dict.windows_update_summary_stats.$wrapper.html(`
				<div style="padding: 10px; color: #666; font-style: italic;">
					Keine Windows Update Daten vorhanden. Klicken Sie auf "9. Windows Updates" um Daten abzurufen.
				</div>
			`);
			frm.fields_dict.windows_update_report.$wrapper.html('');
			return;
		}

		try {
			const data = JSON.parse(frm.doc.windows_update_data_json);
			const compliance = data.compliance || {};
			const agents = data.agents || [];
			const totals = compliance.totals || {installed: 0, pending: 0, failed: 0, total: 0};
			const status = compliance.status || 'green';
			const score = compliance.overall_score || 100;
			const by_site = compliance.by_site || {};

			// Helper: Parse TacticalRMM Datumsformat "MM DD YYYY HH:MM"
			function parseRmmDate(dateStr) {
				if (!dateStr) return null;
				try {
					const parts = dateStr.split(' ');
					if (parts.length >= 3) {
						const month = parseInt(parts[0]) - 1; // JS months are 0-indexed
						const day = parseInt(parts[1]);
						const year = parseInt(parts[2]);
						let hour = 0, minute = 0;
						if (parts.length >= 4 && parts[3].includes(':')) {
							const timeParts = parts[3].split(':');
							hour = parseInt(timeParts[0]) || 0;
							minute = parseInt(timeParts[1]) || 0;
						}
						return new Date(year, month, day, hour, minute);
					}
				} catch (e) {}
				return null;
			}

			// Helper: Parse ISO date (last_seen format)
			function parseIsoDate(dateStr) {
				if (!dateStr) return null;
				try {
					return new Date(dateStr);
				} catch (e) {}
				return null;
			}

			// Problem-Erkennung
			const now = new Date();
			const DAYS_THRESHOLD = 60; // Warnung wenn Updates älter als 60 Tage
			const OFFLINE_THRESHOLD = 7; // Client gilt als "kürzlich online" wenn innerhalb 7 Tagen
			const problems = {
				serviceNotRunning: [],
				outdatedUpdates: [],      // Online aber lange keine Updates
				offlineOutdated: [],      // Offline UND lange keine Updates (erwartbar)
				neverUpdated: []
			};

			for (const agent of agents) {
				// WU-Service Status prüfen
				// "unknown" ist kein Problem (API liefert diese Info nicht), "error" ist ein Problem
				const wuStatus = (agent.wuauserv_status || '').toLowerCase();
				if (wuStatus && wuStatus !== 'running' && wuStatus !== 'run' && wuStatus !== 'unknown') {
					problems.serviceNotRunning.push({
						hostname: agent.hostname,
						status: agent.wuauserv_status
					});
				}

				// Last seen prüfen
				const lastSeen = parseIsoDate(agent.last_seen);
				const daysOffline = lastSeen ? Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24)) : 9999;
				const isRecentlyOnline = daysOffline <= OFFLINE_THRESHOLD;

				// Letztes Update prüfen
				if (agent.patches_last_installed) {
					const lastUpdate = parseRmmDate(agent.patches_last_installed);
					if (lastUpdate) {
						const daysSinceUpdate = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
						if (daysSinceUpdate > DAYS_THRESHOLD) {
							if (isRecentlyOnline) {
								// PROBLEM: Client ist online aber hat lange keine Updates
								problems.outdatedUpdates.push({
									hostname: agent.hostname,
									lastUpdate: lastUpdate,
									daysSince: daysSinceUpdate,
									daysOffline: daysOffline
								});
							} else {
								// ERWARTET: Client ist offline, daher keine Updates möglich
								problems.offlineOutdated.push({
									hostname: agent.hostname,
									lastUpdate: lastUpdate,
									daysSince: daysSinceUpdate,
									daysOffline: daysOffline
								});
							}
						}
					}
				} else if (agent.patches && agent.patches.length > 0) {
					// Hat Patches aber kein Installationsdatum - möglicherweise nie aktualisiert
					const hasInstalledPatches = agent.patches.some(p => p.installed);
					if (!hasInstalledPatches && agent.patches.length > 0) {
						problems.neverUpdated.push({
							hostname: agent.hostname
						});
					}
				}
			}

			const totalProblems = problems.serviceNotRunning.length + problems.outdatedUpdates.length + problems.neverUpdated.length;

			// Status text and colors
			const statusText = {green: 'Alle Systeme aktuell', yellow: 'Updates ausstehend', red: 'Kritische Updates fehlen'};
			const statusBg = {green: '#d4edda', yellow: '#fff3cd', red: '#f8d7da'};
			const statusColor = {green: '#155724', yellow: '#856404', red: '#721c24'};

			// Render Summary Stats with problems
			let summaryHtml = `
				<div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
					<span style="padding: 4px 10px; border-radius: 4px; font-size: 0.9em;
						background: ${statusBg[status]}; color: ${statusColor[status]}; font-weight: 500;">
						${statusText[status]}
					</span>
					<span style="color: #666; font-size: 0.9em;">
						${totals.installed} installiert | ${totals.pending} ausstehend | ${totals.failed} fehlgeschlagen
					</span>
			`;
			if (totalProblems > 0) {
				summaryHtml += `
					<span style="padding: 4px 10px; border-radius: 4px; font-size: 0.9em;
						background: #f8d7da; color: #721c24; font-weight: 500;">
						⚠️ ${totalProblems} Problem${totalProblems > 1 ? 'e' : ''} erkannt
					</span>
				`;
			}
			summaryHtml += `</div>`;
			frm.fields_dict.windows_update_summary_stats.$wrapper.html(summaryHtml);

			// Store problems for use in report
			window._wuProblems = problems;

			// Render Full Report
			let reportHtml = `
				<style>
					.wu-report { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
					.wu-header { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
					.wu-score-card { padding: 20px; border-radius: 8px; text-align: center; min-width: 120px; }
					.wu-score-card.green { background: #d4edda; border: 2px solid #28a745; }
					.wu-score-card.yellow { background: #fff3cd; border: 2px solid #ffc107; }
					.wu-score-card.red { background: #f8d7da; border: 2px solid #dc3545; }
					.wu-score-value { font-size: 2em; font-weight: bold; }
					.wu-score-label { font-size: 0.9em; color: #666; }
					.wu-stats { display: flex; gap: 15px; flex-wrap: wrap; }
					.wu-stat { padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center; min-width: 100px; }
					.wu-stat.warning { background: #fff3cd; }
					.wu-stat.danger { background: #f8d7da; }
					.wu-stat-count { font-size: 1.5em; font-weight: bold; }
					.wu-stat-label { font-size: 0.85em; color: #666; }
					.wu-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
					.wu-table th, .wu-table td { padding: 10px; text-align: left; border-bottom: 1px solid #dee2e6; }
					.wu-table th { background: #f8f9fa; font-weight: 600; }
					.wu-table tr:hover { background: #f8f9fa; }
					.wu-badge { padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 500; }
					.wu-badge.green { background: #d4edda; color: #155724; }
					.wu-badge.yellow { background: #fff3cd; color: #856404; }
					.wu-badge.red { background: #f8d7da; color: #721c24; }
					.wu-section { margin-top: 25px; }
					.wu-section h4 { margin-bottom: 10px; color: #333; }
					.wu-clickable:hover { background: #e3f2fd !important; }
					.wu-clickable td { transition: background 0.2s; }
				</style>
				<div class="wu-report">
					<div class="wu-header">
						<div class="wu-score-card ${status}">
							<div class="wu-score-value">${score}%</div>
							<div class="wu-score-label">Compliance Score</div>
						</div>
						<div class="wu-stats">
							<div class="wu-stat">
								<div class="wu-stat-count">${totals.installed}</div>
								<div class="wu-stat-label">Installiert</div>
							</div>
							<div class="wu-stat warning">
								<div class="wu-stat-count">${totals.pending}</div>
								<div class="wu-stat-label">Ausstehend</div>
							</div>
							<div class="wu-stat danger">
								<div class="wu-stat-count">${totals.failed}</div>
								<div class="wu-stat-label">Fehlgeschlagen</div>
							</div>
							<div class="wu-stat">
								<div class="wu-stat-count">${agents.length}</div>
								<div class="wu-stat-label">Computer</div>
							</div>
						</div>
					</div>
			`;

			// Problem-Box wenn echte Probleme erkannt wurden (nur online Clients zählen als Problem)
			if (totalProblems > 0) {
				reportHtml += `
					<div class="wu-section" style="margin-top: 15px;">
						<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 15px;">
							<h4 style="color: #721c24; margin: 0 0 10px 0;">⚠️ Erkannte Probleme (${totalProblems})</h4>
				`;

				if (problems.serviceNotRunning.length > 0) {
					reportHtml += `
						<div style="margin-bottom: 10px;">
							<strong style="color: #721c24;">🔴 Windows Update Service nicht aktiv (${problems.serviceNotRunning.length}):</strong>
							<div style="margin-left: 20px; color: #721c24;">
								${problems.serviceNotRunning.map(p => `${p.hostname} <span style="color:#856404;">(${p.status})</span>`).join(', ')}
							</div>
						</div>
					`;
				}

				if (problems.outdatedUpdates.length > 0) {
					reportHtml += `
						<div style="margin-bottom: 10px;">
							<strong style="color: #721c24;">🔴 Online aber keine Updates seit über ${DAYS_THRESHOLD} Tagen (${problems.outdatedUpdates.length}):</strong>
							<div style="margin-left: 20px; color: #721c24;">
								${problems.outdatedUpdates.map(p => `${p.hostname} <span style="color:#6c757d;">(${p.daysSince} Tage)</span>`).join(', ')}
							</div>
						</div>
					`;
				}

				if (problems.neverUpdated.length > 0) {
					reportHtml += `
						<div style="margin-bottom: 0;">
							<strong style="color: #721c24;">🔴 Keine installierten Updates (${problems.neverUpdated.length}):</strong>
							<div style="margin-left: 20px; color: #721c24;">
								${problems.neverUpdated.map(p => p.hostname).join(', ')}
							</div>
						</div>
					`;
				}

				reportHtml += `
						</div>
					</div>
				`;
			}

			// Info-Box für offline Clients mit alten Updates (kein echtes Problem, nur Info)
			if (problems.offlineOutdated.length > 0) {
				reportHtml += `
					<div class="wu-section" style="margin-top: 15px;">
						<div style="background: #e2e3e5; border: 1px solid #d6d8db; border-radius: 8px; padding: 15px;">
							<h4 style="color: #383d41; margin: 0 0 10px 0;">ℹ️ Offline-Clients mit veralteten Updates (${problems.offlineOutdated.length})</h4>
							<p style="color: #6c757d; margin: 0 0 10px 0; font-size: 0.9em;">
								Diese Clients sind seit längerem offline und können daher keine Updates erhalten.
							</p>
							<div style="color: #6c757d;">
								${problems.offlineOutdated.map(p => `${p.hostname} <span style="color:#adb5bd;">(${p.daysOffline} Tage offline, ${p.daysSince} Tage ohne Update)</span>`).join(', ')}
							</div>
						</div>
					</div>
				`;
			}

			// Site Overview Table
			const siteNames = Object.keys(by_site).sort();
			if (siteNames.length > 0) {
				reportHtml += `
					<div class="wu-section">
						<h4>Übersicht nach Standort</h4>
						<table class="wu-table">
							<thead>
								<tr>
									<th>Standort</th>
									<th>Computer</th>
									<th>Compliance</th>
									<th>Installiert</th>
									<th>Ausstehend</th>
									<th>Fehlgeschlagen</th>
								</tr>
							</thead>
							<tbody>
				`;
				for (const siteName of siteNames) {
					const siteInfo = by_site[siteName];
					reportHtml += `
						<tr>
							<td><strong>${siteName}</strong></td>
							<td>${siteInfo.agents}</td>
							<td><span class="wu-badge ${siteInfo.status}">${siteInfo.score}%</span></td>
							<td>${siteInfo.installed}</td>
							<td>${siteInfo.pending}</td>
							<td>${siteInfo.failed}</td>
						</tr>
					`;
				}
				reportHtml += `</tbody></table></div>`;
			}

			// Computer Details Table with clickable rows
			reportHtml += `
				<div class="wu-section">
					<h4>Details pro Computer <span style="font-size: 0.8em; color: #666; font-weight: normal;">(Klicken für Details)</span></h4>
					<table class="wu-table" id="wu-computer-table">
						<thead>
							<tr>
								<th>Computer</th>
								<th>Standort</th>
								<th>Betriebssystem</th>
								<th>WU-Service</th>
								<th>Letztes Update</th>
								<th>Installiert</th>
								<th>Ausstehend</th>
								<th>Neustart</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
			`;

			// Store agents data for modal access
			window._wuAgentsData = {};

			const sortedAgents = agents.sort((a, b) => (a.site_name || '').localeCompare(b.site_name || ''));
			for (let i = 0; i < sortedAgents.length; i++) {
				const agent = sortedAgents[i];
				const agentId = 'agent_' + i;
				window._wuAgentsData[agentId] = agent;

				const summary = agent.summary || {};
				const pending = summary.pending || 0;
				const installed = summary.installed || 0;
				const criticalPending = summary.critical_pending || 0;

				// Status-Berechnung
				let statusClass = 'green';
				let statusTextAgent = 'Aktuell';
				if (criticalPending > 0) {
					statusClass = 'red';
					statusTextAgent = 'Kritisch';
				} else if (pending > 0) {
					statusClass = 'yellow';
					statusTextAgent = 'Ausstehend';
				}

				// WU-Service Status mit Farbcodierung
				const wuStatus = agent.wuauserv_status || '';
				const wuStatusLower = wuStatus.toLowerCase();
				let wuServiceHtml = '-';
				if (wuStatus) {
					if (wuStatusLower === 'running' || wuStatusLower === 'run') {
						wuServiceHtml = `<span style="color:#28a745;">✓ Aktiv</span>`;
					} else if (wuStatusLower === 'unknown') {
						// API liefert diese Info nicht - neutral anzeigen
						wuServiceHtml = `<span style="color:#6c757d;">–</span>`;
					} else if (wuStatusLower === 'error') {
						wuServiceHtml = `<span class="wu-badge red">⚠ Fehler</span>`;
					} else {
						// Anderer Status (stopped, disabled, etc.)
						wuServiceHtml = `<span class="wu-badge red">⚠ ${wuStatus}</span>`;
					}
				}

				// Last Seen und Online-Status prüfen
				const lastSeen = parseIsoDate(agent.last_seen);
				const daysOffline = lastSeen ? Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24)) : 9999;
				const isRecentlyOnline = daysOffline <= OFFLINE_THRESHOLD;

				// Letztes Update mit Farbcodierung - Berücksichtigung von Online/Offline
				let lastUpdateHtml = '-';
				let daysSinceUpdate = null;
				if (agent.patches_last_installed) {
					try {
						const lastUpdate = parseRmmDate(agent.patches_last_installed);
						if (lastUpdate) {
							daysSinceUpdate = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
							const dateStr = lastUpdate.toLocaleDateString('de-DE');

							if (daysSinceUpdate > DAYS_THRESHOLD) {
								if (isRecentlyOnline) {
									// PROBLEM: Online aber keine Updates
									lastUpdateHtml = `<span class="wu-badge red" title="${daysSinceUpdate} Tage - Client ist online!">⚠ ${dateStr}</span>`;
								} else {
									// INFO: Offline, daher erwartbar
									lastUpdateHtml = `<span class="wu-badge" style="background:#e2e3e5;color:#383d41;" title="${daysSinceUpdate} Tage (${daysOffline} Tage offline)">${dateStr}</span>`;
								}
							} else if (daysSinceUpdate > 30) {
								lastUpdateHtml = `<span class="wu-badge yellow" title="${daysSinceUpdate} Tage">${dateStr}</span>`;
							} else {
								lastUpdateHtml = `<span style="color:#28a745;">${dateStr}</span>`;
							}
						} else {
							lastUpdateHtml = agent.patches_last_installed;
						}
					} catch(e) {
						lastUpdateHtml = agent.patches_last_installed;
					}
				}

				// Neustart erforderlich
				const needsReboot = agent.needs_reboot ? '<span class="wu-badge yellow">Ja</span>' : '<span style="color:#28a745;">Nein</span>';

				// Zeilen-Hintergrund bei Problemen - nur für ONLINE Clients mit alten Updates
				let rowStyle = 'cursor: pointer;';
				// "unknown" ist kein Problem, nur "error" oder andere bekannte Probleme
				const hasServiceProblem = wuStatus && wuStatusLower !== 'running' && wuStatusLower !== 'run' && wuStatusLower !== 'unknown';
				const hasUpdateProblem = daysSinceUpdate !== null && daysSinceUpdate > DAYS_THRESHOLD && isRecentlyOnline;
				const isOfflineOutdated = daysSinceUpdate !== null && daysSinceUpdate > DAYS_THRESHOLD && !isRecentlyOnline;
				if (hasServiceProblem) {
					rowStyle += ' background: #f8d7da;';
				} else if (hasUpdateProblem) {
					rowStyle += ' background: #fff3cd;';
				} else if (isOfflineOutdated) {
					rowStyle += ' background: #f8f9fa;'; // Grau für Offline-Clients
				}

				reportHtml += `
					<tr class="wu-clickable" onclick="window._showAgentDetails('${agentId}')" style="${rowStyle}">
						<td><strong>${agent.hostname || 'Unknown'}</strong></td>
						<td>${agent.site_name || 'Unknown'}</td>
						<td>${agent.operating_system || 'Unknown'}</td>
						<td>${wuServiceHtml}</td>
						<td>${lastUpdateHtml}</td>
						<td>${installed}</td>
						<td>${pending}</td>
						<td>${needsReboot}</td>
						<td><span class="wu-badge ${statusClass}">${statusTextAgent}</span></td>
					</tr>
				`;
			}
			reportHtml += `</tbody></table></div>`;

			// Helper functions für Modal (müssen in window scope sein)
			window._parseRmmDate = parseRmmDate;
			window._parseIsoDate = parseIsoDate;

			// Add click handler function
			window._showAgentDetails = function(agentId) {
				const agent = window._wuAgentsData[agentId];
				if (!agent) return;

				const installedPatches = agent.installed_patches || agent.patches?.filter(p => p.installed) || [];
				const pendingPatches = agent.pending_patches || agent.patches?.filter(p => !p.installed) || [];

				// Parse dates correctly
				const lastSeenDate = window._parseIsoDate(agent.last_seen);
				const lastUpdateDate = window._parseRmmDate(agent.patches_last_installed);
				const lastSeenStr = lastSeenDate ? lastSeenDate.toLocaleString('de-DE') : '-';
				const lastUpdateStr = lastUpdateDate ? lastUpdateDate.toLocaleString('de-DE') : (agent.patches_last_installed || '-');

				// Calculate days for context
				const now = new Date();
				const daysOffline = lastSeenDate ? Math.floor((now - lastSeenDate) / (1000 * 60 * 60 * 24)) : null;
				const daysSinceUpdate = lastUpdateDate ? Math.floor((now - lastUpdateDate) / (1000 * 60 * 60 * 24)) : null;

				// Online-Status indicator
				let onlineStatus = '-';
				if (daysOffline !== null) {
					if (daysOffline === 0) {
						onlineStatus = '<span style="color:#28a745;">Online (heute)</span>';
					} else if (daysOffline <= 7) {
						onlineStatus = `<span style="color:#28a745;">Kürzlich online (vor ${daysOffline} Tagen)</span>`;
					} else {
						onlineStatus = `<span style="color:#dc3545;">Offline seit ${daysOffline} Tagen</span>`;
					}
				}

				let detailHtml = `
					<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
						<div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
							<div style="flex: 1; min-width: 200px;">
								<strong>Betriebssystem:</strong> ${agent.operating_system || '-'}<br>
								<strong>Standort:</strong> ${agent.site_name || '-'}<br>
								<strong>Online-Status:</strong> ${onlineStatus}<br>
								<strong>Letzter Kontakt:</strong> ${lastSeenStr}<br>
								<strong>Letztes Update:</strong> ${lastUpdateStr}${daysSinceUpdate !== null ? ` <span style="color:#6c757d;">(vor ${daysSinceUpdate} Tagen)</span>` : ''}
							</div>
							<div style="flex: 1; min-width: 200px;">
								<strong>WU-Service:</strong> ${agent.wuauserv_status || '-'}<br>
								<strong>Neustart erforderlich:</strong> ${agent.needs_reboot ? '<span style="color:#dc3545;">Ja</span>' : '<span style="color:#28a745;">Nein</span>'}<br>
								<strong>Updates ausstehend:</strong> ${agent.has_patches_pending ? '<span style="color:#ffc107;">Ja</span>' : '<span style="color:#28a745;">Nein</span>'}
							</div>
						</div>
				`;

				// Pending Updates Table
				if (pendingPatches.length > 0) {
					detailHtml += `
						<h4 style="margin-top: 20px; color: #dc3545;">⚠️ Ausstehende Updates (${pendingPatches.length})</h4>
						<div style="max-height: 250px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 4px;">
							<table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
								<thead style="position: sticky; top: 0; background: #f8f9fa;">
									<tr>
										<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">KB</th>
										<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Titel</th>
										<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Schweregrad</th>
										<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Kategorie</th>
									</tr>
								</thead>
								<tbody>
					`;
					for (const patch of pendingPatches.sort((a,b) => {
						const sev = {Critical: 0, Important: 1, Moderate: 2, Low: 3, Unspecified: 4};
						return (sev[a.severity] || 4) - (sev[b.severity] || 4);
					})) {
						const sevColor = patch.severity === 'Critical' ? '#dc3545' : patch.severity === 'Important' ? '#ffc107' : '#6c757d';
						detailHtml += `
							<tr style="border-bottom: 1px solid #dee2e6;">
								<td style="padding: 6px 8px;">${patch.kb || '-'}</td>
								<td style="padding: 6px 8px;" title="${patch.title || ''}">${(patch.title || '').substring(0, 50)}${(patch.title || '').length > 50 ? '...' : ''}</td>
								<td style="padding: 6px 8px;"><span style="color: ${sevColor}; font-weight: 500;">${patch.severity || '-'}</span></td>
								<td style="padding: 6px 8px;">${patch.category || '-'}</td>
							</tr>
						`;
					}
					detailHtml += `</tbody></table></div>`;
				} else {
					detailHtml += `<p style="color: #28a745; margin-top: 20px;">✅ Keine ausstehenden Updates</p>`;
				}

				// Installed Updates Table
				if (installedPatches.length > 0) {
					detailHtml += `
						<h4 style="margin-top: 20px; color: #28a745;">✅ Installierte Updates (${installedPatches.length})</h4>
						<div style="max-height: 250px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 4px;">
							<table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
								<thead style="position: sticky; top: 0; background: #f8f9fa;">
									<tr>
										<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">KB</th>
										<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Titel</th>
										<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Schweregrad</th>
										<th style="padding: 8px; text-align: left; border-bottom: 2px solid #dee2e6;">Installiert am</th>
									</tr>
								</thead>
								<tbody>
					`;
					for (const patch of installedPatches) {
						let installDate = patch.date_installed || '';
						if (installDate) {
							try { installDate = new Date(installDate).toLocaleDateString('de-DE'); } catch(e) {}
						}
						detailHtml += `
							<tr style="border-bottom: 1px solid #dee2e6;">
								<td style="padding: 6px 8px;">${patch.kb || '-'}</td>
								<td style="padding: 6px 8px;" title="${patch.title || ''}">${(patch.title || '').substring(0, 50)}${(patch.title || '').length > 50 ? '...' : ''}</td>
								<td style="padding: 6px 8px;">${patch.severity || '-'}</td>
								<td style="padding: 6px 8px;">${installDate || '-'}</td>
							</tr>
						`;
					}
					detailHtml += `</tbody></table></div>`;
				}

				detailHtml += `</div>`;

				frappe.msgprint({
					title: __('Windows Updates: ') + agent.hostname,
					message: detailHtml,
					wide: true
				});
			};

			// Critical Patches List
			const criticalPatches = [];
			for (const agent of agents) {
				for (const patch of (agent.patches || [])) {
					if (!patch.installed && (patch.severity === 'Critical' || patch.severity === 'Important')) {
						criticalPatches.push({
							hostname: agent.hostname,
							kb: patch.kb || '',
							title: patch.title || '',
							severity: patch.severity || '',
							category: patch.category || ''
						});
					}
				}
			}

			if (criticalPatches.length > 0) {
				reportHtml += `
					<div class="wu-section">
						<h4>Ausstehende kritische und wichtige Updates</h4>
						<table class="wu-table">
							<thead>
								<tr>
									<th>Computer</th>
									<th>KB</th>
									<th>Titel</th>
									<th>Schweregrad</th>
									<th>Kategorie</th>
								</tr>
							</thead>
							<tbody>
				`;

				criticalPatches.sort((a, b) => {
					if (a.severity === 'Critical' && b.severity !== 'Critical') return -1;
					if (a.severity !== 'Critical' && b.severity === 'Critical') return 1;
					return a.hostname.localeCompare(b.hostname);
				});

				for (const patch of criticalPatches) {
					const severityClass = patch.severity === 'Critical' ? 'red' : 'yellow';
					const titleTruncated = patch.title.length > 60 ? patch.title.substring(0, 60) + '...' : patch.title;
					reportHtml += `
						<tr>
							<td>${patch.hostname}</td>
							<td>${patch.kb}</td>
							<td title="${patch.title}">${titleTruncated}</td>
							<td><span class="wu-badge ${severityClass}">${patch.severity}</span></td>
							<td>${patch.category}</td>
						</tr>
					`;
				}
				reportHtml += `</tbody></table></div>`;
			}

			reportHtml += `</div>`;

			frm.fields_dict.windows_update_report.$wrapper.html(reportHtml);

		} catch (e) {
			console.error('Error rendering Windows Update Report:', e);
			frm.fields_dict.windows_update_summary_stats.$wrapper.html(`
				<div style="padding: 10px; color: #dc3545;">
					Fehler beim Rendern der Windows Update Daten: ${e.message}
				</div>
			`);
		}
	}
});


// ==================== RMM Matching Dialog ====================

function show_rmm_matching_dialog(frm, data) {
	const suggestions = data.suggestions || [];
	const agents = data.agents || [];
	const rmm_instance = data.rmm_instance;

	if (suggestions.length === 0) {
		frappe.msgprint({
			title: __('Keine unverknüpften IT Objects'),
			message: __('Alle IT Objects dieser Landscape sind bereits mit RMM Agents verknüpft.'),
			indicator: 'green'
		});
		return;
	}

	if (agents.length === 0) {
		frappe.msgprint({
			title: __('Keine verfügbaren Agents'),
			message: __('Es sind keine unverknüpften RMM Agents verfügbar.'),
			indicator: 'orange'
		});
		return;
	}

	// Build agent options for select
	let agentOptionsHtml = '<option value="">-- Kein Agent --</option>';
	agents.forEach(agent => {
		agentOptionsHtml += `<option value="${agent.agent_id}">${agent.label}</option>`;
	});

	// Build table rows
	let tableRows = '';
	suggestions.forEach((s, idx) => {
		const confidenceClass = s.confidence >= 90 ? 'success' : s.confidence >= 70 ? 'warning' : s.confidence >= 50 ? 'info' : 'secondary';
		const confidenceText = s.confidence > 0 ? `${s.confidence}%` : '-';

		let suggestedDisplay = '-';
		if (s.suggested_hostname) {
			suggestedDisplay = `<strong>${s.suggested_hostname}</strong><br><small class="text-muted">${s.suggested_ip || ''}</small>`;
		}

		tableRows += `
			<tr data-idx="${idx}" data-it-object="${s.it_object}">
				<td>
					<input type="checkbox" class="rmm-match-select" data-idx="${idx}"
						${s.suggested_agent_id ? 'checked' : ''}>
				</td>
				<td>
					<strong>${s.it_object_title}</strong><br>
					<small class="text-muted">${s.it_object_ip || ''} ${s.it_object_type ? '| ' + s.it_object_type : ''}</small>
				</td>
				<td class="suggested-agent">
					${suggestedDisplay}
				</td>
				<td>
					<span class="badge badge-${confidenceClass}">${confidenceText}</span>
					${s.match_reason ? `<br><small class="text-muted">${s.match_reason}</small>` : ''}
				</td>
				<td>
					<select class="form-control form-control-sm rmm-agent-select" data-idx="${idx}" style="min-width: 200px;">
						${agentOptionsHtml}
					</select>
				</td>
			</tr>
		`;
	});

	const dialogHtml = `
		<style>
			.rmm-matching-table { width: 100%; border-collapse: collapse; }
			.rmm-matching-table th, .rmm-matching-table td {
				padding: 10px;
				border-bottom: 1px solid #dee2e6;
				vertical-align: middle;
			}
			.rmm-matching-table th { background: #f8f9fa; font-weight: 600; }
			.rmm-matching-table tr:hover { background: #f8f9fa; }
			.rmm-matching-stats {
				display: flex; gap: 20px; margin-bottom: 15px; padding: 10px;
				background: #e9ecef; border-radius: 6px;
			}
			.rmm-matching-stat { text-align: center; }
			.rmm-matching-stat .value { font-size: 1.5em; font-weight: bold; }
			.rmm-matching-stat .label { font-size: 0.85em; color: #6c757d; }
			.badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
			.badge-success { background: #d4edda; color: #155724; }
			.badge-warning { background: #fff3cd; color: #856404; }
			.badge-info { background: #d1ecf1; color: #0c5460; }
			.badge-secondary { background: #e2e3e5; color: #383d41; }
		</style>
		<div class="rmm-matching-container">
			<div class="rmm-matching-stats">
				<div class="rmm-matching-stat">
					<div class="value">${data.unmatched_count}</div>
					<div class="label">Unverknüpfte IT Objects</div>
				</div>
				<div class="rmm-matching-stat">
					<div class="value">${data.available_agents_count}</div>
					<div class="label">Verfügbare Agents</div>
				</div>
				<div class="rmm-matching-stat">
					<div class="value" id="high-confidence-count">${suggestions.filter(s => s.confidence >= 70).length}</div>
					<div class="label">Gute Vorschläge (≥70%)</div>
				</div>
			</div>
			<div style="margin-bottom: 10px;">
				<button class="btn btn-xs btn-default" id="select-high-confidence">
					Alle guten Vorschläge auswählen (≥70%)
				</button>
				<button class="btn btn-xs btn-default" id="select-all-suggestions">
					Alle Vorschläge auswählen
				</button>
				<button class="btn btn-xs btn-default" id="deselect-all">
					Alle abwählen
				</button>
			</div>
			<div style="max-height: 400px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 6px;">
				<table class="rmm-matching-table">
					<thead>
						<tr>
							<th style="width: 40px;">
								<input type="checkbox" id="select-all-checkbox">
							</th>
							<th>IT Object</th>
							<th>Vorgeschlagener Agent</th>
							<th>Confidence</th>
							<th>Manuell auswählen</th>
						</tr>
					</thead>
					<tbody>
						${tableRows}
					</tbody>
				</table>
			</div>
		</div>
	`;

	// Store suggestions for later use
	window._rmmMatchingSuggestions = suggestions;

	const dialog = new frappe.ui.Dialog({
		title: __('IT Objects mit RMM Agents verknüpfen'),
		size: 'extra-large',
		fields: [
			{
				fieldtype: 'HTML',
				fieldname: 'matching_content',
				options: dialogHtml
			}
		],
		primary_action_label: __('Ausgewählte verknüpfen'),
		primary_action: function() {
			apply_selected_mappings(dialog, rmm_instance);
		}
	});

	dialog.show();

	// Setup event handlers after dialog is shown
	setTimeout(() => {
		const $wrapper = dialog.$wrapper;

		// Pre-select suggested agents in dropdowns
		suggestions.forEach((s, idx) => {
			if (s.suggested_agent_id) {
				$wrapper.find(`.rmm-agent-select[data-idx="${idx}"]`).val(s.suggested_agent_id);
			}
		});

		// Select all checkbox
		$wrapper.find('#select-all-checkbox').on('change', function() {
			$wrapper.find('.rmm-match-select').prop('checked', $(this).prop('checked'));
		});

		// Select high confidence
		$wrapper.find('#select-high-confidence').on('click', function() {
			suggestions.forEach((s, idx) => {
				if (s.confidence >= 70) {
					$wrapper.find(`.rmm-match-select[data-idx="${idx}"]`).prop('checked', true);
				}
			});
		});

		// Select all suggestions
		$wrapper.find('#select-all-suggestions').on('click', function() {
			suggestions.forEach((s, idx) => {
				if (s.suggested_agent_id) {
					$wrapper.find(`.rmm-match-select[data-idx="${idx}"]`).prop('checked', true);
				}
			});
		});

		// Deselect all
		$wrapper.find('#deselect-all').on('click', function() {
			$wrapper.find('.rmm-match-select').prop('checked', false);
			$wrapper.find('#select-all-checkbox').prop('checked', false);
		});

		// When manual selection changes, update checkbox
		$wrapper.find('.rmm-agent-select').on('change', function() {
			const idx = $(this).data('idx');
			const hasValue = $(this).val() !== '';
			$wrapper.find(`.rmm-match-select[data-idx="${idx}"]`).prop('checked', hasValue);
		});

	}, 100);
}

function apply_selected_mappings(dialog, rmm_instance) {
	const $wrapper = dialog.$wrapper;
	const suggestions = window._rmmMatchingSuggestions || [];
	const mappings = [];

	suggestions.forEach((s, idx) => {
		const isSelected = $wrapper.find(`.rmm-match-select[data-idx="${idx}"]`).prop('checked');
		if (!isSelected) return;

		const selectedAgentId = $wrapper.find(`.rmm-agent-select[data-idx="${idx}"]`).val();
		if (!selectedAgentId) return;

		mappings.push({
			it_object: s.it_object,
			agent_id: selectedAgentId
		});
	});

	if (mappings.length === 0) {
		frappe.msgprint(__('Keine Zuordnungen ausgewählt.'));
		return;
	}

	frappe.dom.freeze(__('Verknüpfe {0} IT Objects...', [mappings.length]));

	frappe.call({
		method: 'msp.rmm_import.apply_rmm_mappings',
		args: {
			mappings: JSON.stringify(mappings),
			rmm_instance: rmm_instance
		},
		callback: function(r) {
			frappe.dom.unfreeze();
			if (r.exc) {
				frappe.msgprint({
					title: __('Fehler'),
					indicator: 'red',
					message: __('Verknüpfung fehlgeschlagen.')
				});
				return;
			}

			if (r.message) {
				const result = r.message;
				let message = __('Erfolgreich verknüpft: {0} von {1}', [result.success, result.total]);
				if (result.errors && result.errors.length > 0) {
					message += '<br><br><strong>Fehler:</strong><br>' + result.errors.join('<br>');
				}

				frappe.msgprint({
					title: __('Verknüpfung abgeschlossen'),
					indicator: result.errors.length > 0 ? 'orange' : 'green',
					message: message
				});

				dialog.hide();
			}
		}
	});
}
