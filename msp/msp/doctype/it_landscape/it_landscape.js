// Copyright (c) 2021, itsdave GmbH and contributors
// For license information, please see license.txt

frappe.ui.form.on('IT Landscape', {
	refresh: function(frm) {
		// Action buttons
		frm.add_custom_button('Copy SSH Keys', () => frm.trigger('copy_ssh_keys'), 'Actions');
		if (frm.doc.ticket_system_link) {
			frm.add_custom_button('Open Ticket System', () => frm.trigger('open_ticket_system'), 'Actions');
		}
		if (frm.doc.monitoring_link) {
			frm.add_custom_button('Open Monitoring', () => frm.trigger('open_monitoring'), 'Actions');
		}

		// Workflow buttons for IT Object Import (numbered steps)
		if (frm.doc.rmm_instance) {
			frm.add_custom_button(__('1. AD-Daten abrufen'), () => frm.trigger('fetch_ad_data'), __('Import Workflow'));
			frm.add_custom_button(__('2. RMM-Daten abrufen'), () => frm.trigger('fetch_rmm_data'), __('Import Workflow'));
			frm.add_custom_button(__('3. IT Objects erstellen'), () => frm.trigger('start_unified_import'), __('Import Workflow'));
			frm.add_custom_button(__('Bestehende synchronisieren'), () => frm.trigger('sync_existing_objects'), __('Import Workflow'));
		}

		// Set up field filters for Default-AD fields
		frm.trigger('setup_ad_field_filters');

		// Initialize image gallery
		frm.trigger('init_attachment_gallery');
	},

	// Filter for Default AD Credentials - only show credentials belonging to this landscape
	setup_ad_field_filters: function(frm) {
		// Filter for default_ad_credentials - show only credentials from this IT Landscape
		frm.set_query('default_ad_credentials', function() {
			let filters = {};
			// Only show credentials belonging to this IT Landscape
			if (frm.doc.name && !frm.is_new()) {
				filters['it_landscape'] = frm.doc.name;
			}
			return { filters: filters };
		});

		// Filter for default_ad_domain_controller - only show IT Objects of this landscape
		frm.set_query('default_ad_domain_controller', function() {
			let filters = {};
			// Only show objects from this landscape
			if (frm.doc.name && !frm.is_new()) {
				filters['it_landscape'] = frm.doc.name;
			}
			return { filters: filters };
		});
	},

	init_attachment_gallery: function(frm) {
		// Inject CSS only once
		if (!document.getElementById('it-landscape-gallery-styles')) {
			const style = document.createElement('style');
			style.id = 'it-landscape-gallery-styles';
			style.textContent = `
				.attachment-gallery {
					margin: 15px 0;
					padding: 20px;
					background: var(--card-bg);
					border-radius: 8px;
					border: 1px solid var(--border-color);
				}
				.attachment-gallery-title {
					font-size: 12px;
					font-weight: 600;
					color: var(--text-muted);
					text-transform: uppercase;
					margin-bottom: 15px;
				}
				.gallery-main-view {
					position: relative;
					width: 100%;
					max-width: 800px;
					margin: 0 auto 15px auto;
					background: var(--bg-color);
					border-radius: 8px;
					overflow: hidden;
					min-height: 300px;
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.gallery-main-view .gallery-item {
					display: none;
					width: 100%;
					text-align: center;
				}
				.gallery-main-view .gallery-item.active {
					display: flex;
					flex-direction: column;
					align-items: center;
					justify-content: center;
				}
				.gallery-main-view .gallery-item img {
					max-width: 100%;
					max-height: 400px;
					object-fit: contain;
					cursor: zoom-in;
					border-radius: 4px;
				}
				.gallery-main-view .gallery-item.pdf-item {
					padding: 40px;
				}
				.gallery-main-view .pdf-icon {
					font-size: 80px;
					color: var(--text-muted);
					margin-bottom: 15px;
				}
				.gallery-main-view .pdf-filename {
					font-size: 14px;
					color: var(--text-color);
					word-break: break-word;
					max-width: 80%;
				}
				.gallery-main-view .pdf-open-btn {
					margin-top: 15px;
					padding: 8px 20px;
					background: var(--primary);
					color: white;
					border: none;
					border-radius: 4px;
					cursor: pointer;
					font-size: 13px;
				}
				.gallery-main-view .pdf-open-btn:hover {
					background: var(--primary-dark);
				}
				.gallery-nav-btn {
					position: absolute;
					top: 50%;
					transform: translateY(-50%);
					width: 44px;
					height: 44px;
					background: rgba(0,0,0,0.5);
					color: white;
					border: none;
					border-radius: 50%;
					cursor: pointer;
					font-size: 20px;
					display: flex;
					align-items: center;
					justify-content: center;
					transition: background 0.2s;
					z-index: 10;
				}
				.gallery-nav-btn:hover {
					background: rgba(0,0,0,0.7);
				}
				.gallery-nav-btn.prev { left: 10px; }
				.gallery-nav-btn.next { right: 10px; }
				.gallery-nav-btn:disabled {
					opacity: 0.3;
					cursor: not-allowed;
				}
				.gallery-thumbnails {
					display: flex;
					gap: 10px;
					justify-content: center;
					flex-wrap: wrap;
					margin-top: 10px;
				}
				.gallery-thumbnail {
					width: 60px;
					height: 60px;
					border-radius: 6px;
					overflow: hidden;
					cursor: pointer;
					border: 2px solid transparent;
					transition: border-color 0.2s, transform 0.2s;
					background: var(--bg-color);
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.gallery-thumbnail:hover {
					transform: scale(1.05);
				}
				.gallery-thumbnail.active {
					border-color: var(--primary);
				}
				.gallery-thumbnail img {
					width: 100%;
					height: 100%;
					object-fit: cover;
				}
				.gallery-thumbnail .thumb-pdf {
					font-size: 24px;
					color: var(--text-muted);
				}
				.gallery-counter {
					text-align: center;
					font-size: 12px;
					color: var(--text-muted);
					margin-top: 10px;
				}

				/* Fullscreen Lightbox */
				.gallery-lightbox {
					position: fixed;
					top: 0;
					left: 0;
					width: 100vw;
					height: 100vh;
					background: rgba(0,0,0,0.95);
					z-index: 10000;
					display: flex;
					align-items: center;
					justify-content: center;
					opacity: 0;
					visibility: hidden;
					transition: opacity 0.3s, visibility 0.3s;
					overflow: hidden;
				}
				.gallery-lightbox.active {
					opacity: 1;
					visibility: visible;
				}
				.gallery-lightbox-image-container {
					position: relative;
					width: 100%;
					height: 100%;
					display: flex;
					align-items: center;
					justify-content: center;
					overflow: hidden;
				}
				.gallery-lightbox img {
					max-width: 95vw;
					max-height: 95vh;
					object-fit: contain;
					transition: transform 0.1s ease-out;
					cursor: grab;
					user-select: none;
				}
				.gallery-lightbox img.dragging {
					cursor: grabbing;
					transition: none;
				}
				.gallery-lightbox-close {
					position: absolute;
					top: 20px;
					right: 20px;
					width: 50px;
					height: 50px;
					background: rgba(255,255,255,0.1);
					color: white;
					border: none;
					border-radius: 50%;
					cursor: pointer;
					font-size: 28px;
					display: flex;
					align-items: center;
					justify-content: center;
					z-index: 10001;
				}
				.gallery-lightbox-close:hover {
					background: rgba(255,255,255,0.2);
				}
				.gallery-lightbox-zoom-info {
					position: absolute;
					bottom: 20px;
					left: 50%;
					transform: translateX(-50%);
					background: rgba(0,0,0,0.7);
					color: white;
					padding: 8px 16px;
					border-radius: 20px;
					font-size: 13px;
					opacity: 0;
					transition: opacity 0.3s;
					pointer-events: none;
				}
				.gallery-lightbox-zoom-info.visible {
					opacity: 1;
				}
				.gallery-lightbox-hint {
					position: absolute;
					bottom: 60px;
					left: 50%;
					transform: translateX(-50%);
					color: rgba(255,255,255,0.5);
					font-size: 12px;
					pointer-events: none;
				}
			`;
			document.head.appendChild(style);
		}

		// Remove any existing gallery (prevents duplicates on navigation)
		frm.$wrapper.find('.attachment-gallery-container').remove();

		// Fetch attachments
		frappe.db.get_list('File', {
			fields: ['name', 'file_name', 'file_url', 'is_private'],
			filters: {
				'attached_to_name': frm.docname,
				'attached_to_doctype': 'IT Landscape'
			}
		}).then(attachments => {
			if (!attachments || attachments.length === 0) {
				return;
			}

			// Separate images and PDFs
			const items = attachments.map(att => {
				const ext = (att.file_name || '').split('.').pop().toLowerCase();
				const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
				const isPdf = ext === 'pdf';
				return {
					...att,
					isImage,
					isPdf,
					ext
				};
			});

			// Build gallery HTML
			let galleryHtml = `
				<div class="attachment-gallery-container">
					<div class="attachment-gallery">
						<div class="attachment-gallery-title">Attachments (${items.length})</div>
						<div class="gallery-main-view">
							<button class="gallery-nav-btn prev" ${items.length <= 1 ? 'style="display:none"' : ''}>❮</button>
							<button class="gallery-nav-btn next" ${items.length <= 1 ? 'style="display:none"' : ''}>❯</button>
			`;

			// Main view items
			items.forEach((item, index) => {
				if (item.isImage) {
					galleryHtml += `
						<div class="gallery-item ${index === 0 ? 'active' : ''}" data-index="${index}" data-url="${item.file_url}">
							<img src="${item.file_url}" alt="${item.file_name}" title="Click to view fullscreen">
						</div>
					`;
				} else if (item.isPdf) {
					galleryHtml += `
						<div class="gallery-item pdf-item ${index === 0 ? 'active' : ''}" data-index="${index}" data-url="${item.file_url}">
							<div class="pdf-icon">📄</div>
							<div class="pdf-filename">${item.file_name}</div>
							<button class="pdf-open-btn" data-url="${item.file_url}">PDF öffnen</button>
						</div>
					`;
				} else {
					galleryHtml += `
						<div class="gallery-item pdf-item ${index === 0 ? 'active' : ''}" data-index="${index}" data-url="${item.file_url}">
							<div class="pdf-icon">📎</div>
							<div class="pdf-filename">${item.file_name}</div>
							<button class="pdf-open-btn" data-url="${item.file_url}">Datei öffnen</button>
						</div>
					`;
				}
			});

			galleryHtml += `
						</div>
						<div class="gallery-counter"><span class="current">1</span> / ${items.length}</div>
						<div class="gallery-thumbnails">
			`;

			// Thumbnails
			items.forEach((item, index) => {
				if (item.isImage) {
					galleryHtml += `
						<div class="gallery-thumbnail ${index === 0 ? 'active' : ''}" data-index="${index}">
							<img src="${item.file_url}" alt="${item.file_name}">
						</div>
					`;
				} else if (item.isPdf) {
					galleryHtml += `
						<div class="gallery-thumbnail ${index === 0 ? 'active' : ''}" data-index="${index}">
							<span class="thumb-pdf">📄</span>
						</div>
					`;
				} else {
					galleryHtml += `
						<div class="gallery-thumbnail ${index === 0 ? 'active' : ''}" data-index="${index}">
							<span class="thumb-pdf">📎</span>
						</div>
					`;
				}
			});

			galleryHtml += `
						</div>
					</div>
				</div>
			`;

			// Add lightbox to body if not exists
			if (!document.getElementById('gallery-lightbox')) {
				const lightbox = document.createElement('div');
				lightbox.id = 'gallery-lightbox';
				lightbox.className = 'gallery-lightbox';
				lightbox.innerHTML = `
					<button class="gallery-lightbox-close">×</button>
					<div class="gallery-lightbox-image-container">
						<img src="" alt="Fullscreen view">
					</div>
					<div class="gallery-lightbox-zoom-info">100%</div>
					<div class="gallery-lightbox-hint">Mausrad zum Zoomen · Ziehen zum Verschieben · Doppelklick zum Zurücksetzen</div>
				`;
				document.body.appendChild(lightbox);

				const img = lightbox.querySelector('img');
				const zoomInfo = lightbox.querySelector('.gallery-lightbox-zoom-info');
				let scale = 1;
				let translateX = 0;
				let translateY = 0;
				let isDragging = false;
				let startX, startY, startTranslateX, startTranslateY;
				let zoomInfoTimeout;

				function updateTransform() {
					img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
				}

				function showZoomInfo() {
					zoomInfo.textContent = `${Math.round(scale * 100)}%`;
					zoomInfo.classList.add('visible');
					clearTimeout(zoomInfoTimeout);
					zoomInfoTimeout = setTimeout(() => {
						zoomInfo.classList.remove('visible');
					}, 1500);
				}

				function resetZoom() {
					scale = 1;
					translateX = 0;
					translateY = 0;
					updateTransform();
					showZoomInfo();
				}

				// Mouse wheel zoom
				lightbox.addEventListener('wheel', (e) => {
					if (!lightbox.classList.contains('active')) return;
					e.preventDefault();

					const rect = img.getBoundingClientRect();
					const mouseX = e.clientX - rect.left - rect.width / 2;
					const mouseY = e.clientY - rect.top - rect.height / 2;

					const delta = e.deltaY > 0 ? 0.9 : 1.1;
					const newScale = Math.min(Math.max(scale * delta, 0.5), 10);

					// Adjust translation to zoom towards mouse position
					if (newScale !== scale) {
						const scaleRatio = newScale / scale;
						translateX = mouseX - (mouseX - translateX) * scaleRatio;
						translateY = mouseY - (mouseY - translateY) * scaleRatio;
						scale = newScale;
						updateTransform();
						showZoomInfo();
					}
				}, { passive: false });

				// Drag to pan
				img.addEventListener('mousedown', (e) => {
					if (scale <= 1) return;
					e.preventDefault();
					isDragging = true;
					img.classList.add('dragging');
					startX = e.clientX;
					startY = e.clientY;
					startTranslateX = translateX;
					startTranslateY = translateY;
				});

				document.addEventListener('mousemove', (e) => {
					if (!isDragging) return;
					translateX = startTranslateX + (e.clientX - startX);
					translateY = startTranslateY + (e.clientY - startY);
					updateTransform();
				});

				document.addEventListener('mouseup', () => {
					if (isDragging) {
						isDragging = false;
						img.classList.remove('dragging');
					}
				});

				// Double click to reset
				img.addEventListener('dblclick', (e) => {
					e.preventDefault();
					resetZoom();
				});

				// Close lightbox on click (but not on image when zoomed)
				lightbox.addEventListener('click', (e) => {
					if (e.target.classList.contains('gallery-lightbox-close')) {
						lightbox.classList.remove('active');
						resetZoom();
					} else if (e.target === lightbox || e.target.classList.contains('gallery-lightbox-image-container')) {
						if (scale <= 1) {
							lightbox.classList.remove('active');
							resetZoom();
						}
					}
				});

				// Close on Escape key
				document.addEventListener('keydown', (e) => {
					if (e.key === 'Escape' && lightbox.classList.contains('active')) {
						lightbox.classList.remove('active');
						resetZoom();
					}
				});

				// Reset zoom when opening new image
				lightbox.resetZoom = resetZoom;
			}

			// Insert gallery into form dashboard
			const $dashboard = frm.$wrapper.find('.form-dashboard.visible-section');
			if ($dashboard.length) {
				$dashboard.append(galleryHtml);
			} else {
				frm.$wrapper.find('.form-layout').prepend(galleryHtml);
			}

			// Get gallery container (scoped)
			const $gallery = frm.$wrapper.find('.attachment-gallery-container');
			let currentIndex = 0;

			function showItem(index) {
				currentIndex = index;
				$gallery.find('.gallery-item').removeClass('active');
				$gallery.find('.gallery-item').eq(index).addClass('active');
				$gallery.find('.gallery-thumbnail').removeClass('active');
				$gallery.find('.gallery-thumbnail').eq(index).addClass('active');
				$gallery.find('.gallery-counter .current').text(index + 1);
			}

			// Navigation buttons (scoped to this gallery)
			$gallery.find('.gallery-nav-btn.next').on('click', function() {
				const newIndex = (currentIndex + 1) % items.length;
				showItem(newIndex);
			});

			$gallery.find('.gallery-nav-btn.prev').on('click', function() {
				const newIndex = (currentIndex - 1 + items.length) % items.length;
				showItem(newIndex);
			});

			// Thumbnail clicks
			$gallery.find('.gallery-thumbnail').on('click', function() {
				const index = parseInt($(this).data('index'));
				showItem(index);
			});

			// Image click for lightbox
			$gallery.find('.gallery-item img').on('click', function() {
				const src = $(this).attr('src');
				const lightbox = document.getElementById('gallery-lightbox');
				lightbox.querySelector('img').src = src;
				if (lightbox.resetZoom) lightbox.resetZoom();
				lightbox.classList.add('active');
			});

			// PDF/File open button
			$gallery.find('.pdf-open-btn').on('click', function() {
				const url = $(this).data('url');
				window.open(url, '_blank');
			});

			// Keyboard navigation
			$(document).off('keydown.gallery').on('keydown.gallery', function(e) {
				if (!$gallery.is(':visible')) return;
				if (e.key === 'ArrowRight') {
					$gallery.find('.gallery-nav-btn.next').click();
				} else if (e.key === 'ArrowLeft') {
					$gallery.find('.gallery-nav-btn.prev').click();
				}
			});
		});
	},

	open_ticket_system: function(frm) {
		window.open(frm.doc.ticket_system_link, '_blank').focus();
	},

	open_monitoring: function(frm) {
		window.open(frm.doc.monitoring_link, '_blank').focus();
	},

	rmm_get_agents: function(frm) {
		frappe.call({
			method: "msp.tactical-rmm.get_agents",
			args: {
				it_landscape: frm.doc.name,
				rmm_instance: frm.doc.rmm_instance,
				tactical_rmm_tenant_caption: frm.doc.tactical_rmm_tenant_caption
			},
			callback: (response) => {
				frappe.msgprint(__(response.message));
			}
		});
	},

	copy_ssh_keys: function(frm) {
		frappe.call({
			method: "msp.whitelisted_tools.get_ssh_keys_for_landscape",
			args: {
				landscape: frm.doc.name
			},
			callback: (response) => {
				if (response.message.startsWith("#")) {
					frm.events.CopyToClipboard(response.message);
					frappe.msgprint(__('Keys copied to clipboard.'));
				} else {
					frappe.msgprint(__(response.message));
				}
			}
		});
	},

	CopyToClipboard: function(value) {
		if (navigator.clipboard) {
			navigator.clipboard.writeText(value);
		} else {
			const tempInput = document.createElement("textarea");
			tempInput.value = value;
			document.body.appendChild(tempInput);
			tempInput.select();
			document.execCommand("copy");
			document.body.removeChild(tempInput);
		}
	},

	// Workflow Step 1: Fetch AD Data
	fetch_ad_data: function(frm) {
		// First, ensure we have an MSP Documentation
		frappe.call({
			method: 'msp.rmm_import.get_or_create_msp_documentation',
			args: { it_landscape: frm.doc.name },
			callback: function(r) {
				if (!r.message) return;

				const msp_doc_info = r.message;

				if (!msp_doc_info.has_ad_config) {
					frappe.msgprint({
						title: __('AD-Konfiguration fehlt'),
						indicator: 'orange',
						message: __('Keine AD-Credentials konfiguriert. Bitte konfigurieren Sie die Default-AD-Credentials in dieser IT Landscape oder in der MSP Documentation "{0}".', [msp_doc_info.name])
					});
					return;
				}

				frappe.confirm(
					__('AD-Computer-Daten vom Domain Controller abrufen?'),
					function() {
						frappe.dom.freeze(__('AD-Daten werden abgerufen...'));
						frappe.call({
							method: 'msp.tactical-rmm.fetch_and_store_ad_computer_data',
							args: { documentation_name: msp_doc_info.name },
							callback: function(r) {
								frappe.dom.unfreeze();
								if (r.message) {
									frappe.show_alert({
										message: __('AD-Daten erfolgreich abgerufen: {0} Computer', [r.message.count || 0]),
										indicator: 'green'
									}, 5);
								} else {
									frappe.show_alert({
										message: __('AD-Daten abgerufen'),
										indicator: 'green'
									}, 5);
								}
							},
							error: function(r) {
								frappe.dom.unfreeze();
								frappe.msgprint(__('Fehler beim Abrufen der AD-Daten'));
							}
						});
					}
				);
			}
		});
	},

	// Workflow Step 2: Fetch RMM Data
	fetch_rmm_data: function(frm) {
		if (!frm.doc.rmm_instance) {
			frappe.msgprint(__('Keine RMM Instance konfiguriert'));
			return;
		}
		if (!frm.doc.tactical_rmm_tenant_caption) {
			frappe.msgprint(__('Kein RMM Tenant Caption konfiguriert'));
			return;
		}

		frappe.confirm(
			__('RMM-Agentendaten von Tactical RMM abrufen?'),
			function() {
				frappe.dom.freeze(__('RMM-Daten werden abgerufen...'));
				frappe.call({
					method: 'msp.tactical-rmm.get_agents',
					args: {
						it_landscape: frm.doc.name,
						rmm_instance: frm.doc.rmm_instance,
						tactical_rmm_tenant_caption: frm.doc.tactical_rmm_tenant_caption
					},
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.message) {
							frappe.show_alert({
								message: r.message,
								indicator: 'green'
							}, 5);
						}
					},
					error: function(r) {
						frappe.dom.unfreeze();
						frappe.msgprint(__('Fehler beim Abrufen der RMM-Daten'));
					}
				});
			}
		);
	},

	// Workflow Step 3: Start unified import (create IT Objects)
	start_unified_import: function(frm) {
		// First, get or create MSP Documentation
		frappe.call({
			method: 'msp.rmm_import.get_or_create_msp_documentation',
			args: { it_landscape: frm.doc.name },
			callback: function(r) {
				if (r.message) {
					frm.events.show_import_dialog(frm, r.message);
				}
			}
		});
	},

	show_import_dialog: function(frm, msp_doc_info) {
		const { name: msp_doc_name, created, has_ad_config, has_ad_data } = msp_doc_info;

		// Status-HTML generieren
		let status_html = `<div class="alert alert-info">
			<b>IT Landscape:</b> ${frm.doc.title || frm.doc.name}<br>
			<b>RMM Instance:</b> ${frm.doc.rmm_instance || '<span class="text-danger">Nicht konfiguriert</span>'}<br>
			<b>RMM Tenant:</b> ${frm.doc.tactical_rmm_tenant_caption || '<span class="text-warning">Nicht gesetzt</span>'}
		</div>`;

		if (created) {
			status_html += `<div class="alert alert-success">
				<i class="fa fa-check"></i> MSP Documentation wurde automatisch erstellt.
			</div>`;
		}

		let d = new frappe.ui.Dialog({
			title: __('IT Objects importieren'),
			fields: [
				{ fieldname: 'source_info', fieldtype: 'HTML', options: status_html },

				// MSP Documentation Auswahl
				{ fieldname: 'doc_section', fieldtype: 'Section Break', label: __('Datenquelle') },
				{
					fieldname: 'msp_documentation',
					fieldtype: 'Link',
					label: __('MSP Documentation'),
					options: 'MSP Documentation',
					default: msp_doc_name,
					description: __('Standard-Documentation oder alternative waehlen (z.B. fuer 2. AD)'),
					get_query: function() {
						return {
							filters: { landscape: frm.doc.name }
						};
					},
					onchange: function() {
						frm.events.update_ad_status(d, d.get_value('msp_documentation'));
					}
				},

				// AD-Optionen
				{ fieldname: 'ad_section', fieldtype: 'Section Break', label: 'Active Directory' },
				{
					fieldname: 'include_ad_data',
					fieldtype: 'Check',
					label: __('AD-Daten einbeziehen'),
					default: has_ad_data ? 1 : 0,
					description: __('RMM-Agents mit AD-Computerdaten anreichern')
				},
				{
					fieldname: 'fetch_fresh_ad_data',
					fieldtype: 'Check',
					label: __('AD-Daten vorher aktualisieren'),
					default: 0,
					depends_on: 'include_ad_data',
					description: __('Aktuelle Daten vom Domain Controller abrufen')
				},
				{ fieldname: 'ad_status', fieldtype: 'HTML' }
			],
			primary_action_label: __('Import starten'),
			primary_action: async function(values) {
				d.hide();

				// Optional: AD-Daten vorher aktualisieren
				if (values.include_ad_data && values.fetch_fresh_ad_data) {
					frappe.dom.freeze(__('AD-Daten werden abgerufen...'));
					try {
						await frappe.call({
							method: 'msp.tactical-rmm.fetch_and_store_ad_computer_data',
							args: { documentation_name: values.msp_documentation }
						});
					} catch (e) {
						frappe.dom.unfreeze();
						frappe.msgprint(__('Fehler beim Abrufen der AD-Daten: ') + (e.message || e));
						return;
					}
					frappe.dom.unfreeze();
				}

				// Import-Session erstellen
				frappe.dom.freeze(__('Import-Session wird erstellt...'));
				frappe.call({
					method: 'msp.rmm_import.create_import_session_from_landscape',
					args: {
						it_landscape: frm.doc.name,
						include_ad_data: values.include_ad_data ? 1 : 0
					},
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.message) {
							frappe.set_route('Form', 'RMM Import Session', r.message);
						}
					},
					error: function(r) {
						frappe.dom.unfreeze();
						frappe.msgprint(__('Fehler beim Erstellen der Import-Session'));
					}
				});
			}
		});

		// Initial AD-Status anzeigen
		frm.events.update_ad_status(d, msp_doc_name);
		d.show();
	},

	update_ad_status: function(dialog, msp_doc_name) {
		if (!msp_doc_name) return;

		frappe.call({
			method: 'msp.rmm_import.get_ad_status',
			args: { documentation_name: msp_doc_name },
			callback: function(r) {
				let html = '';
				if (!r.message) return;

				if (!r.message.has_config) {
					html = `<div class="alert alert-secondary mt-2">
						<i class="fa fa-info-circle"></i> Keine AD-Credentials in dieser Documentation.
					</div>`;
					dialog.set_value('include_ad_data', 0);
					dialog.set_df_property('include_ad_data', 'read_only', 1);
				} else if (!r.message.has_data) {
					html = `<div class="alert alert-warning mt-2">
						<i class="fa fa-clock-o"></i> AD-Credentials vorhanden, Daten noch nicht abgerufen.
						<br><small>Aktivieren Sie "AD-Daten vorher aktualisieren".</small>
					</div>`;
					dialog.set_df_property('include_ad_data', 'read_only', 0);
					dialog.set_value('fetch_fresh_ad_data', 1);
				} else {
					html = `<div class="alert alert-success mt-2">
						<i class="fa fa-check"></i> AD-Daten vorhanden
						(${r.message.computer_count} Computer, Stand: ${r.message.last_update})
					</div>`;
					dialog.set_df_property('include_ad_data', 'read_only', 0);
				}
				dialog.fields_dict.ad_status.$wrapper.html(html);
			}
		});
	},

	sync_existing_objects: function(frm) {
		frappe.confirm(
			__('Moechten Sie die AD-Daten fuer alle bestehenden IT Objects dieser Landscape synchronisieren?'),
			function() {
				frappe.dom.freeze(__('AD-Daten werden synchronisiert...'));
				frappe.call({
					method: 'msp.rmm_import.sync_ad_data_for_existing_objects',
					args: { it_landscape: frm.doc.name },
					callback: function(r) {
						frappe.dom.unfreeze();
						if (r.message) {
							let msg = __('Synchronisation abgeschlossen:') + '<br>' +
								__('Synchronisiert: {0}', [r.message.synced_count]) + '<br>' +
								__('Nicht gefunden: {0}', [r.message.not_found_count]);
							if (r.message.errors && r.message.errors.length > 0) {
								msg += '<br><br>' + __('Fehler:') + '<br>' + r.message.errors.slice(0, 5).join('<br>');
								if (r.message.errors.length > 5) {
									msg += '<br>...und ' + (r.message.errors.length - 5) + ' weitere';
								}
							}
							frappe.msgprint(msg);
						}
					},
					error: function() {
						frappe.dom.unfreeze();
						frappe.msgprint(__('Fehler bei der Synchronisation'));
					}
				});
			}
		);
	}
});
