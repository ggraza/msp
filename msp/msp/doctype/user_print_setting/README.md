# User Print Setting

## Übersicht

DocType zur Speicherung von Drucker- und Print-Format-Einstellungen pro Benutzer und DocType.

## Felder

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `user` | Link (User) | Benutzer |
| `reference_doctype` | Link (DocType) | Ziel-DocType (z.B. Purchase Receipt) |
| `printer` | Link (Network Printer Settings) | Standarddrucker |
| `print_format` | Link (Print Format) | Standard-Druckformat |

## API-Methoden

### `get_user_print_setting(reference_doctype, user=None)`
Holt die Druckeinstellungen für einen Benutzer und DocType.

```python
from msp.msp.doctype.user_print_setting.user_print_setting import get_user_print_setting

settings = get_user_print_setting("Purchase Receipt")
# Returns: {"printer": "Label-Lager", "print_format": "label"}
```

### `save_user_print_setting(reference_doctype, printer, print_format, user=None)`
Speichert oder aktualisiert die Druckeinstellungen.

```python
from msp.msp.doctype.user_print_setting.user_print_setting import save_user_print_setting

save_user_print_setting("Purchase Receipt", "Label-Lager", "label")
```

---

# Label Printing API

## Übersicht

Backend-API für den Direktdruck von Etiketten auf Netzwerkdrucker via CUPS.

**Datei:** `apps/msp/msp/label_printing.py`

## Methoden

### `get_available_printers()`
Gibt Liste aller konfigurierten Network Printer Settings zurück.

### `get_label_print_formats()`
Gibt Liste aller Print Formats für den DocType "Item" zurück.

### `print_item_labels(item_code, quantity, printer_setting, print_format)`
Druckt Labels für einen Artikel.

```python
from msp.label_printing import print_item_labels

result = print_item_labels(
    item_code="MAPID-123456",
    quantity=5,
    printer_setting="Label-Lager",
    print_format="label"
)
# Returns: {"success": True, "printed": 5, "total": 5, "errors": 0}
```

### `print_multiple_item_labels(items, printer_setting, print_format)`
Batch-Druck für mehrere Artikel.

```python
from msp.label_printing import print_multiple_item_labels

result = print_multiple_item_labels(
    items=[
        {"item_code": "MAPID-123", "quantity": 3},
        {"item_code": "MAPID-456", "quantity": 2}
    ],
    printer_setting="Label-Lager",
    print_format="label"
)
```

---

# Frontend: Purchase Receipt

**Datei:** `apps/msp/msp/public/js/purchase_receipt.js`

## Funktion

Fügt eine "Aktionen" Button-Group zum Purchase Receipt hinzu mit der Aktion "Print Labels".

## Dialog

- Drucker-Auswahl (aus Network Printer Settings)
- Print Format-Auswahl
- Checkbox "Als Standard speichern"
- Tabelle aller Positionen mit editierbaren Mengen
- Druck-Buttons pro Zeile (Menge / Einzeln)
- "Print All" Button

---

# CUPS-Drucker

Konfigurierte Label-Drucker:

| Name | IP | Beschreibung |
|------|-----|--------------|
| Label-Lager | 192.168.241.116 | Brother QL-820NWB |
| Label-Vertrieb | 192.168.240.40 | Brother QL-820NWB |
