
import frappe

@frappe.whitelist()
def remove_all_attachments(doctype, docname):
    """Entfernt alle Anhänge von einem Dokument"""
    attachments = frappe.get_all("File", filters={
        "attached_to_doctype": doctype,
        "attached_to_name": docname
    })

    count = 0
    for attachment in attachments:
        frappe.delete_doc("File", attachment.name, ignore_permissions=True)
        count += 1

    return count

@frappe.whitelist()
def copy_attachments(source_doctype, source_docname, target_doctype, target_docname):
    attachments = frappe.get_all("File", filters={"attached_to_doctype": source_doctype, "attached_to_name": source_docname})

    for attachment in attachments:
        # Überprüfen Sie den Datei-URL-Wert
        file_url = frappe.db.get_value("File", attachment.name, "file_url")
        
        # Überprüfen, ob ein Anhang mit derselben URL bereits für das Ziel-Dokument existiert
        exists = frappe.db.exists({
            "doctype": "File",
            "file_url": file_url,
            "attached_to_doctype": target_doctype,
            "attached_to_name": target_docname
        })

        if not exists:
            # Wenn nicht existiert, dann Anhang zum Ziel-Dokument kopieren
            attach = frappe.get_doc({
                "doctype": "File",
                "file_url": file_url,
                "attached_to_doctype": target_doctype,
                "attached_to_name": target_docname
            })
            attach.insert(ignore_permissions=True)