// Copyright (c) 2021, itsdave GmbH and contributors
// For license information, please see license.txt

frappe.ui.form.on('IT Object', {
	refresh: function (frm) {
		// RMM Integration buttons
		frm.trigger('setup_rmm_buttons');

		const loader = `
		<div class="line-wobble"></div>
		<style>
		.line-wobble {
			--uib-size: 80px;
			--uib-speed: 1.75s;
			--uib-color: black;
			--uib-line-weight: 5px;

			position: relative;
			margin: 0 auto;
			top: 45%;
			display: flex;
			align-items: center;
			justify-content: center;
			height: var(--uib-line-weight);
			width: var(--uib-size);
			border-radius: calc(var(--uib-line-weight) / 2);
			overflow: hidden;
			transform: translate3d(0, 0, 0);
		  }

		  .line-wobble::before {
			content: '';
			position: absolute;
			top: 0;
			left: 0;
			height: 100%;
			width: 100%;
			background-color: var(--uib-color);
			opacity: 0.1;
		  }

		  .line-wobble::after {
			content: '';
			height: 100%;
			width: 100%;
			border-radius: calc(var(--uib-line-weight) / 2);
			animation: wobble var(--uib-speed) ease-in-out infinite;
			transform: translateX(-95%);
			background-color: var(--uib-color);
		  }

		  @keyframes wobble {
			0%,
			100% {
			  transform: translateX(-95%);
			}
			50% {
			  transform: translateX(95%);
			}
		  }
		</style>
		`;

		const container = document.getElementById('oitc-output');

		// Set width and height to <div> parent element and to <form> grandparent element so relative width and height with % works greate
		container.parentElement.parentElement.style.width = '100%';
		container.parentElement.parentElement.style.height = '100%';
		container.parentElement.style.width = '100%';
		container.parentElement.style.height = '90%';

		// Set this styles to showcase where the information will appear
		container.style.width = '100%';
		container.style.height = '100%';
		container.style.background = 'rgba(212, 204, 203, 0.4)';
		container.innerHTML = loader;

		frm.call('get_oitc_host_status_data', {})
			.then((response) => {
				const container = document.getElementById('oitc-output');

				if (response.message.status !== 200) {
					container.innerHTML = response.message.response || 'An error occurred while fetching OITC data';
					return;
				}

				let background = response.message?.statusColors?.upStateColor;
				if (response.message?.host?.hostStatus?.currentState?.toUpperCase() === "DOWN") {
					background = response.message?.statusColors?.downStateColor;
				} else if (response.message?.host?.hostStatus?.currentState?.toUpperCase() === "UNREACHABLE") {
					background = response.message?.statusColors?.unreachableStateColor;
				}

				container.innerHTML = `
				<div class="js-oitc-output">
					<div>
						<h1 class="font-size-50" style="color: white;">
							${response.message?.host?.hostStatus?.currentState?.toUpperCase()}
						</h1>
					</div>
					<div>
						<div>Current State since</div>
						<h3 style="color: white; margin: 1rem 0;">
							${response.message?.host?.hostStatus?.currentStateSince}
						</h3>
					</div>
					<div>
						<div>Last check</div>
						<h3 style="color: white; margin: 1rem 0;">
							${response.message?.host?.hostStatus?.lastCheck}
						</h3>
					</div>
					<div>
						<div>Next check</div>
						<h3 style="color: white; margin: 1rem 0;">
							${response.message?.host?.hostStatus?.nextCheck}
						</h3>
					</div>
					<div>
						<div>Services</div>
						<h3 style="color: white; margin: 1rem 0;">
							Total Services: ${response.message?.host?.servicesStatus?.totalServices}
						</h3>
						<div>Services Status:</div>
						<h3 style="color: white; margin: 1rem 0;">
							<ul style="text-align:left;">
								<li>OK: ${response.message?.host?.servicesStatus?.state?.ok}</li>
								<li>CRITICAL: ${response.message?.host?.servicesStatus?.state?.critical}</li>
								<li>WARNING: ${response.message?.host?.servicesStatus?.state?.warning}</li>
								<li>UNKNOWN: ${response.message?.host?.servicesStatus?.state?.unknown}</li>
							</ul>
						</h3>
					</div>
				</div>
				`

				let statusData = document.querySelector('.js-oitc-output')
				statusData.style.textAlign = 'center';
				statusData.style.color = '#FFF';
				statusData.style.fontWeight = 'Bold';
				statusData.style.background = background;
				statusData.style.padding = '1rem';
			})

		if (frm.doc.admin_interface_link) {
			frm.add_custom_button('Open Admin Interface', () => frm.trigger('open_admin_interface'), 'Actions');
		};
		if (frm.doc.monitoring_link) {
			frm.add_custom_button('Open Monitoring', () => frm.trigger('open_monitoring'), 'Actions');
		};
		if (frm.doc.link) {
			frm.add_custom_button('Copy Main Admin Account User', () => frm.trigger('get_user'), 'Actions');
		};
		if (frm.doc.link) {
			frm.add_custom_button('Copy Main Admin Account PW', () => frm.trigger('get_pw'), 'Actions');
		};
		if (frm.doc.rmm_agent_id && frm.doc.rmm_instance) {
			frm.add_custom_button(__('Software Abrufen'), () => frm.trigger('fetch_software'), __('Aktionen'));
		};
	},
	fetch_software: function(frm) {
		frappe.dom.freeze(__('Rufe Software-Daten ab...'));
		frappe.call({
			method: 'msp.rmm_import.fetch_software_for_it_object',
			args: { it_object_name: frm.doc.name },
			callback: function(r) {
				frappe.dom.unfreeze();
				if (r.exc) {
					frappe.msgprint({
						title: __('Fehler'),
						indicator: 'red',
						message: __('Software-Abruf fehlgeschlagen.')
					});
					return;
				}
				frappe.show_alert({
					message: __('Software-Daten aktualisiert ({0} Einträge)', [r.message.count]),
					indicator: 'green'
				});
				frm.reload_doc();
			}
		});
	},
	open_admin_interface: function (frm) {
		window.open(frm.doc.admin_interface_link, '_blank').focus();
	},
	open_monitoring: function (frm) {
		window.open(frm.doc.monitoring_link, '_blank').focus();
	},
	get_pw: function(frm) {
        frm.call('copy_pw', {
            'user_agent': navigator.userAgent,
            'platform': navigator.platform,
        },
        (r) => {
			frm.events.CopyToClipboard(r.message)
        }
        );
    },
	get_user: function(frm) {
        frm.call('copy_user', {
            'user_agent': navigator.userAgent,
            'platform': navigator.platform,
        },
        (r) => {
			frm.events.CopyToClipboard(r.message)
        }
        );
    },
	CopyToClipboard: function(value) {
		var tempInput = document.createElement("input");
		tempInput.value = value;
		document.body.appendChild(tempInput);
		tempInput.select();
		document.execCommand("copy");
		document.body.removeChild(tempInput);
	},

	setup_rmm_buttons: function(frm) {
		if (frm.is_new()) return;

		// Check if already linked to RMM
		if (frm.doc.rmm_agent_id && frm.doc.rmm_instance) {
			// Show sync button
			frm.add_custom_button(__('RMM Daten aktualisieren'), function() {
				frappe.dom.freeze(__('Synchronisiere RMM-Daten...'));
				frappe.call({
					method: 'msp.rmm_import.sync_matched_object',
					args: { it_object_name: frm.doc.name },
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.exc) {
							frappe.msgprint({
								title: __('Fehler'),
								indicator: 'red',
								message: __('RMM-Sync fehlgeschlagen.')
							});
							return;
						}
						frappe.show_alert({
							message: __('RMM-Daten erfolgreich aktualisiert'),
							indicator: 'green'
						});
						frm.reload_doc();
					}
				});
			}, __('RMM'));

			// Show unlink button
			frm.add_custom_button(__('RMM Verknüpfung lösen'), function() {
				frappe.confirm(
					__('Möchten Sie die Verknüpfung zu RMM Agent "{0}" wirklich aufheben?', [frm.doc.rmm_agent_id]),
					function() {
						frappe.call({
							method: 'msp.rmm_import.unlink_it_object_from_agent',
							args: { it_object_name: frm.doc.name },
							callback: function(r) {
								if (r.message && r.message.success) {
									frappe.show_alert({
										message: __('RMM-Verknüpfung erfolgreich gelöst'),
										indicator: 'green'
									});
									frm.reload_doc();
								}
							}
						});
					}
				);
			}, __('RMM'));
		} else {
			// Show link button
			frm.add_custom_button(__('Mit RMM Agent verknüpfen'), function() {
				frm.trigger('show_rmm_link_dialog');
			}, __('RMM'));
		}
	},

	show_rmm_link_dialog: function(frm) {
		frappe.dom.freeze(__('Lade verfügbare RMM Agents...'));

		frappe.call({
			method: 'msp.rmm_import.get_available_agents_for_it_object',
			args: { it_object_name: frm.doc.name },
			callback: function(r) {
				frappe.dom.unfreeze();

				if (r.exc) {
					frappe.msgprint({
						title: __('Fehler'),
						indicator: 'red',
						message: __('Konnte RMM Agents nicht laden.')
					});
					return;
				}

				const data = r.message;

				if (!data.success) {
					frappe.msgprint({
						title: __('Fehler'),
						indicator: 'red',
						message: data.error || __('Unbekannter Fehler')
					});
					return;
				}

				if (data.agents.length === 0) {
					frappe.msgprint({
						title: __('Keine Agents verfügbar'),
						indicator: 'orange',
						message: __('Es sind keine unverknüpften RMM Agents verfügbar.')
					});
					return;
				}

				// Build agent options
				let agentOptions = data.agents.map(a => ({
					label: a.label,
					value: a.agent_id,
					description: `${a.operating_system} | ${a.monitoring_type} | ${a.status}`
				}));

				// Show client filter info and best match suggestion
				let infoHtml = '';

				// Show which client/tenant is being filtered
				if (data.client_filter) {
					infoHtml += `
						<div style="margin-bottom: 10px; padding: 8px 12px; background: #e3f2fd; border-radius: 4px; font-size: 0.9em;">
							<strong>Kunde/Tenant:</strong> ${data.client_filter}
							<span style="color: #666;"> (${data.agents.length} Agents verfügbar)</span>
						</div>
					`;
				}

				// Show best match suggestion
				if (data.best_match && data.best_match.agent_id) {
					const confidenceClass = data.best_match.confidence >= 90 ? 'green' :
						data.best_match.confidence >= 70 ? 'orange' : 'blue';
					infoHtml += `
						<div style="margin-bottom: 15px; padding: 12px; background: #e8f5e9; border-radius: 6px; border-left: 4px solid #4caf50;">
							<strong>Bester Vorschlag:</strong> ${data.best_match.hostname}<br>
							<span style="color: ${confidenceClass};">Confidence: ${data.best_match.confidence}%</span>
							${data.best_match.match_reason ? ` - ${data.best_match.match_reason}` : ''}
						</div>
					`;
				}

				// Create dialog
				let d = new frappe.ui.Dialog({
					title: __('Mit RMM Agent verknüpfen'),
					size: 'large',
					fields: [
						{
							fieldtype: 'HTML',
							fieldname: 'info_section',
							options: infoHtml
						},
						{
							fieldtype: 'Autocomplete',
							fieldname: 'agent_id',
							label: __('RMM Agent auswählen'),
							options: agentOptions,
							reqd: 1,
							default: data.best_match ? data.best_match.agent_id : null
						},
						{
							fieldtype: 'Check',
							fieldname: 'sync_now',
							label: __('Daten sofort synchronisieren'),
							default: 1
						}
					],
					primary_action_label: __('Verknüpfen'),
					primary_action: function(values) {
						if (!values.agent_id) {
							frappe.msgprint(__('Bitte wählen Sie einen Agent aus.'));
							return;
						}

						frappe.dom.freeze(__('Verknüpfe mit RMM Agent...'));
						frappe.call({
							method: 'msp.rmm_import.link_it_object_to_agent',
							args: {
								it_object_name: frm.doc.name,
								agent_id: values.agent_id,
								rmm_instance: data.rmm_instance,
								sync_now: values.sync_now ? 1 : 0
							},
							callback: function(r) {
								frappe.dom.unfreeze();
								d.hide();

								if (r.exc) {
									frappe.msgprint({
										title: __('Fehler'),
										indicator: 'red',
										message: __('Verknüpfung fehlgeschlagen.')
									});
									return;
								}

								if (r.message && r.message.success) {
									frappe.show_alert({
										message: r.message.message,
										indicator: r.message.sync_error ? 'orange' : 'green'
									});
									frm.reload_doc();
								}
							}
						});
					}
				});

				d.show();
			}
		});
	}
});
