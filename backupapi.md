# Backup API - Admin API Dokumentation

Dokumentation der Admin-Endpoints für die Entwicklung eines Web-Interfaces.

## Base URL

```
https://backupapi.itsdave.de/api/v1
```

## Authentifizierung

Alle Admin-Endpoints erfordern den `X-Admin-Key` Header:

```
X-Admin-Key: <ADMIN_KEY>
```

**Fehler bei ungültigem Key:**
```json
HTTP 401
{"detail": "Invalid admin API key"}
```

---

## Token-Verwaltung

### Alle Tokens auflisten

```
GET /admin/tokens
```

**Response:**
```json
{
  "tokens": [
    {
      "id": 1,
      "name": "prod-servers",
      "active": 1,
      "created_at": "2026-01-01 10:00:00",
      "token_hash_preview": "65248fa2...",
      "allowed_hosts": ["web*", "db-primary"]
    },
    {
      "id": 2,
      "name": "monitoring",
      "active": 1,
      "created_at": "2026-01-02 10:00:00",
      "token_hash_preview": "a1b2c3d4...",
      "allowed_hosts": []
    }
  ]
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | int | Eindeutige Token-ID |
| `name` | string | Token-Name |
| `active` | int | 1 = aktiv, 0 = deaktiviert |
| `created_at` | string | Erstellungszeitpunkt |
| `token_hash_preview` | string | Erste 8 Zeichen des Hashes |
| `allowed_hosts` | array | Host-Patterns (leer = alle Hosts erlaubt) |

---

### Token erstellen

```
POST /admin/tokens
Content-Type: multipart/form-data
```

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `name` | string | Ja | Eindeutiger Name (max 100 Zeichen) |

**Request:**
```bash
curl -X POST "$API/admin/tokens" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -F "name=webserver-prod"
```

**Response (201):**
```json
{
  "status": "success",
  "message": "Token created successfully",
  "token_id": 5,
  "name": "webserver-prod",
  "token": "V56pLTCkJTr4weA6Nkmwuw_h4gPO4l6b4hPLvQisxfM",
  "warning": "Save this token now! It cannot be retrieved later."
}
```

**Wichtig:** Das `token` Feld wird nur einmal zurückgegeben! Es wird als SHA-256 Hash gespeichert und kann nicht wiederhergestellt werden.

**Fehler (409):**
```json
{"detail": "Token name already exists"}
```

---

### Token-Details abrufen

```
GET /admin/tokens/{token_id}
```

**Response:**
```json
{
  "id": 1,
  "name": "prod-servers",
  "active": 1,
  "created_at": "2026-01-01 10:00:00",
  "token_hash_preview": "65248fa2...",
  "allowed_hosts": ["web*"],
  "backup_count": 156
}
```

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `backup_count` | int | Anzahl der Backups mit diesem Token |

**Fehler (404):**
```json
{"detail": "Token not found"}
```

---

### Token deaktivieren

```
POST /admin/tokens/{token_id}/revoke
```

Deaktiviert ein Token. Das Token kann danach nicht mehr zur Authentifizierung verwendet werden.

**Response:**
```json
{"status": "success", "message": "Token 'prod-servers' revoked"}
```

**Fehler (400):**
```json
{"detail": "Token is already revoked"}
```

---

### Token aktivieren

```
POST /admin/tokens/{token_id}/activate
```

Reaktiviert ein zuvor deaktiviertes Token.

**Response:**
```json
{"status": "success", "message": "Token 'prod-servers' activated"}
```

**Fehler (400):**
```json
{"detail": "Token is already active"}
```

---

### Token löschen

```
DELETE /admin/tokens/{token_id}
```

Löscht ein Token unwiderruflich. Host-Bindings werden automatisch mitgelöscht.

**Response:**
```json
{"status": "success", "message": "Token 'prod-servers' deleted"}
```

---

## Host-Binding Verwaltung

Tokens können auf bestimmte Hosts beschränkt werden. Ein Token ohne Bindings hat Zugriff auf **alle** Hosts.

### Patterns

| Pattern | Beschreibung |
|---------|--------------|
| `webserver01` | Exakter Match |
| `web*` | Alle Hosts die mit "web" beginnen |
| `*-prod` | Alle Hosts die mit "-prod" enden |
| `db-?` | Einzelnes Zeichen Wildcard |
| `*` | Alle Hosts (explizit) |

---

### Host-Bindings anzeigen

```
GET /admin/tokens/{token_id}/hosts
```

**Response:**
```json
{
  "token_id": 1,
  "token_name": "prod-servers",
  "hosts": [
    {"id": 1, "hostname_pattern": "web*", "created_at": "2026-01-07 20:00:00"},
    {"id": 2, "hostname_pattern": "db-primary", "created_at": "2026-01-07 20:00:00"}
  ]
}
```

---

### Host-Binding hinzufügen

```
POST /admin/tokens/{token_id}/hosts
Content-Type: multipart/form-data
```

| Parameter | Typ | Pflicht | Beschreibung |
|-----------|-----|---------|--------------|
| `hostname_pattern` | string | Ja | Hostname oder Pattern |

**Request:**
```bash
curl -X POST "$API/admin/tokens/1/hosts" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -F "hostname_pattern=web*"
```

**Response:**
```json
{"status": "success", "message": "Host pattern 'web*' added to token 'prod-servers'"}
```

**Fehler (409):**
```json
{"detail": "Host pattern already exists for this token"}
```

---

### Host-Binding entfernen

```
DELETE /admin/tokens/{token_id}/hosts/{hostname_pattern}
```

**Request:**
```bash
curl -X DELETE "$API/admin/tokens/1/hosts/web*" \
  -H "X-Admin-Key: $ADMIN_KEY"
```

**Response:**
```json
{"status": "success", "message": "Host pattern 'web*' removed from token 'prod-servers'"}
```

---

## Backup-Verwaltung

### Alle Backups auflisten

```
GET /admin/backups
```

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `hostname` | string | - | Filter nach Hostname |
| `backup_type` | string | - | Filter nach Typ |
| `token_name` | string | - | Filter nach Token |
| `from_date` | string | - | Von Datum (YYYY-MM-DD) |
| `to_date` | string | - | Bis Datum (YYYY-MM-DD) |
| `limit` | int | 1000 | Max. Ergebnisse (max 10000) |
| `offset` | int | 0 | Offset für Pagination |

**Response:**
```json
{
  "backups": [
    {
      "id": 6,
      "hostname": "webserver01",
      "backup_type": "full",
      "log_type": "json",
      "token_name": "prod-servers",
      "created_at": "2026-01-07 19:34:45",
      "size": 1524
    }
  ],
  "count": 1,
  "total": 156,
  "limit": 1000,
  "offset": 0
}
```

---

### Einzelnes Backup abrufen

```
GET /admin/backups/{backup_id}
```

**Response:**
```json
{
  "id": 6,
  "hostname": "webserver01",
  "backup_type": "full",
  "log_content": {"status": "success", "files": 1523, "size_mb": 2300},
  "log_type": "json",
  "token_name": "prod-servers",
  "created_at": "2026-01-07 19:34:45"
}
```

Bei `log_type: "json"` wird `log_content` als JSON-Objekt zurückgegeben, sonst als String.

---

### Backup löschen

```
DELETE /admin/backups/{backup_id}
```

**Response:**
```json
{"status": "success", "message": "Backup 6 deleted"}
```

---

## Statistiken

### Statistik-Übersicht

```
GET /admin/stats
```

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `from_date` | string | Von Datum (YYYY-MM-DD) |
| `to_date` | string | Bis Datum (YYYY-MM-DD) |

**Response:**
```json
{
  "total_backups": 156,
  "unique_hosts": 12,
  "by_type": [
    {"backup_type": "full", "count": 45},
    {"backup_type": "incremental", "count": 89},
    {"backup_type": null, "count": 22}
  ],
  "by_token": [
    {"token_name": "prod-servers", "count": 120},
    {"token_name": "dev-servers", "count": 36}
  ],
  "by_day": [
    {"date": "2026-01-07", "count": 24},
    {"date": "2026-01-06", "count": 22}
  ]
}
```

---

## Audit-Logs

### Audit-Logs abrufen

```
GET /admin/audit
```

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `event_type` | string | - | Filter nach Event-Typ |
| `from_date` | string | - | Von Datum (YYYY-MM-DD) |
| `to_date` | string | - | Bis Datum (YYYY-MM-DD) |
| `limit` | int | 100 | Max. Ergebnisse (max 1000) |

**Event-Typen:**
- `TOKEN_CREATED` - Token erstellt
- `TOKEN_DELETED` - Token gelöscht
- `TOKEN_REVOKED` - Token deaktiviert
- `TOKEN_ACTIVATED` - Token aktiviert
- `TOKEN_HOST_ADDED` - Host-Binding hinzugefügt
- `TOKEN_HOST_REMOVED` - Host-Binding entfernt
- `BACKUP_SUBMITTED` - Backup hochgeladen
- `BACKUP_DELETED` - Backup gelöscht
- `AUTH_FAILED` - Authentifizierung fehlgeschlagen
- `ADMIN_AUTH_SUCCESS` - Admin-Authentifizierung erfolgreich
- `ADMIN_AUTH_FAILED` - Admin-Authentifizierung fehlgeschlagen
- `ACCESS_DENIED` - Zugriff verweigert (Host-Binding)

**Response:**
```json
{
  "audit_logs": [
    {
      "id": 15,
      "event_type": "TOKEN_CREATED",
      "details": "name=webserver-prod",
      "ip_address": "192.168.1.100",
      "created_at": "2026-01-07 20:20:38"
    }
  ]
}
```

---

## Fehler-Codes

| Code | Beschreibung |
|------|--------------|
| 400 | Ungültige Anfrage (z.B. Datumsformat, bereits aktiv/inaktiv) |
| 401 | Admin-Key ungültig |
| 404 | Ressource nicht gefunden |
| 409 | Konflikt (z.B. Name existiert bereits) |
| 413 | Datei zu groß |
| 503 | Admin API nicht konfiguriert |

---

## Beispiel: Kompletter Token-Workflow

```bash
API="https://backupapi.itsdave.de/api/v1"
ADMIN_KEY="your-admin-key"

# 1. Token erstellen
TOKEN_RESPONSE=$(curl -s -X POST "$API/admin/tokens" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -F "name=webserver-prod")
echo "$TOKEN_RESPONSE"
TOKEN_ID=$(echo "$TOKEN_RESPONSE" | jq -r '.token_id')

# 2. Host-Bindings hinzufügen
curl -s -X POST "$API/admin/tokens/$TOKEN_ID/hosts" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -F "hostname_pattern=web*"

curl -s -X POST "$API/admin/tokens/$TOKEN_ID/hosts" \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -F "hostname_pattern=nginx-*"

# 3. Token-Details prüfen
curl -s "$API/admin/tokens/$TOKEN_ID" \
  -H "X-Admin-Key: $ADMIN_KEY" | jq

# 4. Token deaktivieren (bei Bedarf)
curl -s -X POST "$API/admin/tokens/$TOKEN_ID/revoke" \
  -H "X-Admin-Key: $ADMIN_KEY"

# 5. Token reaktivieren
curl -s -X POST "$API/admin/tokens/$TOKEN_ID/activate" \
  -H "X-Admin-Key: $ADMIN_KEY"

# 6. Token löschen
curl -s -X DELETE "$API/admin/tokens/$TOKEN_ID" \
  -H "X-Admin-Key: $ADMIN_KEY"
```

---

## JavaScript/Fetch Beispiele

```javascript
const API = 'https://backupapi.itsdave.de/api/v1';
const ADMIN_KEY = 'your-admin-key';

const headers = {
  'X-Admin-Key': ADMIN_KEY
};

// Alle Tokens laden
async function getTokens() {
  const response = await fetch(`${API}/admin/tokens`, { headers });
  return response.json();
}

// Token erstellen
async function createToken(name) {
  const formData = new FormData();
  formData.append('name', name);

  const response = await fetch(`${API}/admin/tokens`, {
    method: 'POST',
    headers,
    body: formData
  });
  return response.json();
}

// Host-Binding hinzufügen
async function addHostBinding(tokenId, pattern) {
  const formData = new FormData();
  formData.append('hostname_pattern', pattern);

  const response = await fetch(`${API}/admin/tokens/${tokenId}/hosts`, {
    method: 'POST',
    headers,
    body: formData
  });
  return response.json();
}

// Token deaktivieren
async function revokeToken(tokenId) {
  const response = await fetch(`${API}/admin/tokens/${tokenId}/revoke`, {
    method: 'POST',
    headers
  });
  return response.json();
}

// Statistiken laden
async function getStats(fromDate, toDate) {
  const params = new URLSearchParams();
  if (fromDate) params.append('from_date', fromDate);
  if (toDate) params.append('to_date', toDate);

  const response = await fetch(`${API}/admin/stats?${params}`, { headers });
  return response.json();
}

// Backups mit Pagination laden
async function getBackups(page = 0, limit = 50, filters = {}) {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: (page * limit).toString(),
    ...filters
  });

  const response = await fetch(`${API}/admin/backups?${params}`, { headers });
  return response.json();
}
```
