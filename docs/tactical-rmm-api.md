# TacticalRMM API Zugriff

## RMM Instanz

**Name:** `RMMINST-Default (Migrated from MSP Settings)`
**API URL:** `https://api.itsdave.de`
**API Key:** `VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5`

## Credentials aus Frappe abrufen

```python
import frappe

rmm = frappe.get_doc("RMM Instance", "RMMINST-Default (Migrated from MSP Settings)")
api_url, headers, verify = rmm.get_api_credentials()
# api_url = "https://api.itsdave.de"
# headers = {"X-API-KEY": "..."}
```

## API Endpoints

### Agents

```bash
# Alle Agents abrufen
curl -s "https://api.itsdave.de/agents/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5"

# Agent Details
curl -s "https://api.itsdave.de/agents/{agent_id}/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5"
```

### Scripts

```bash
# Alle Scripts auflisten
curl -s "https://api.itsdave.de/scripts/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5"

# Script Details
curl -s "https://api.itsdave.de/scripts/{script_id}/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5"
```

### Script erstellen

```bash
# Script Content escapen
SCRIPT_CONTENT=$(cat mein_script.ps1 | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")

# Script hochladen
curl -s -X POST "https://api.itsdave.de/scripts/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"MSP - Mein Script\",
    \"description\": \"Beschreibung des Scripts\",
    \"shell\": \"powershell\",
    \"category\": \"MSP\",
    \"supported_platforms\": [\"windows\"],
    \"script_body\": ${SCRIPT_CONTENT},
    \"default_timeout\": 120
  }"
```

### Script auf Agent ausführen

**WICHTIG:** Das Feld `run_on_server` muss explizit auf `false` gesetzt werden!

```bash
curl -s -X POST "https://api.itsdave.de/agents/{agent_id}/runscript/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5" \
  -H "Content-Type: application/json" \
  -d '{
    "output": "wait",
    "emails": [],
    "emailMode": "default",
    "custom_field": null,
    "save_all_output": false,
    "script": 154,
    "args": [],
    "env_vars": [],
    "timeout": 120,
    "run_as_user": false,
    "run_on_server": false
  }'
```

**Output-Modi:**
- `"wait"` - Wartet auf Ergebnis und gibt es zurück
- `"forget"` - Führt aus ohne auf Ergebnis zu warten
- `"email"` - Sendet Ergebnis per E-Mail

### Windows Updates

```bash
# Patches für Agent abrufen
curl -s "https://api.itsdave.de/winupdate/{agent_id}/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5"

# Update-Scan starten
curl -s -X POST "https://api.itsdave.de/winupdate/{agent_id}/scan/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5"

# Approved Updates installieren
curl -s -X POST "https://api.itsdave.de/winupdate/{agent_id}/install/" \
  -H "X-API-KEY: VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5"
```

## Python Beispiel

```python
import requests
import json

API_URL = "https://api.itsdave.de"
API_KEY = "VXHWE1ZNNWVYRRU3SYCAJ80CZM9NRFP5"

headers = {"X-API-KEY": API_KEY, "Content-Type": "application/json"}

def run_script(agent_id, script_id, timeout=120):
    """Führt ein Script auf einem Agent aus und gibt das Ergebnis zurück."""
    payload = {
        "output": "wait",
        "emails": [],
        "emailMode": "default",
        "custom_field": None,
        "save_all_output": False,
        "script": script_id,
        "args": [],
        "env_vars": [],
        "timeout": timeout,
        "run_as_user": False,
        "run_on_server": False  # WICHTIG!
    }

    r = requests.post(
        f"{API_URL}/agents/{agent_id}/runscript/",
        headers=headers,
        json=payload,
        timeout=timeout + 30
    )

    if r.status_code == 200:
        return json.loads(r.json())  # Doppeltes JSON-Parsing nötig
    else:
        raise Exception(f"API Error {r.status_code}: {r.text}")

# Beispiel: Windows Update Diagnostics auf CWWS12
result = run_script(
    agent_id="HTTlEmzqhqGyRNISuTeOMcKWcPEaATdZiSdWcwTR",
    script_id=154
)
print(f"Status: {result['status']}")
print(f"Issues: {result['issues']}")
```

## MSP Scripts in TacticalRMM

| ID  | Name | Beschreibung |
|-----|------|--------------|
| 153 | MSP - Windows Update Diagnostics | Text-Ausgabe für manuelle Analyse |
| 154 | MSP - Windows Update Diagnostics JSON | JSON-Ausgabe für programmatische Verarbeitung |

## Bekannte Probleme

1. **500 Fehler bei Script-Ausführung:** Prüfen ob `run_on_server: false` gesetzt ist
2. **Leere Antwort:** Agent ist möglicherweise offline
3. **Timeout:** Script-Timeout + 30 Sekunden für Request-Timeout verwenden

## Swagger UI

API-Dokumentation verfügbar unter:
`https://api.itsdave.de/api/schema/swagger-ui/`
