# MSP App - TODO

## Windows Update Reporting

### Scan-Button für einzelne Agents
- [ ] Button in Computer-Tabelle oder Detail-Modal hinzufügen
- [ ] API-Aufruf: `POST /winupdate/{agent_id}/scan/` - Scan anstoßen
- [ ] API-Aufruf: `POST /winupdate/{agent_id}/install/` - Approved Updates installieren
- [ ] Feedback nach Auslösung anzeigen (asynchrone Operation)
- [ ] Optional: Bulk-Scan für alle Agents eines Mandanten

### Windows Update Diagnostics Scripts (TacticalRMM)
- [x] **ID 153**: MSP - Windows Update Diagnostics (Text-Ausgabe)
- [x] **ID 154**: MSP - Windows Update Diagnostics JSON (strukturierte Ausgabe)

JSON-Skript liefert:
- `hostname`, `timestamp`, `os` (caption, build, version)
- `services` - Status aller relevanten Dienste (wuauserv, bits, cryptsvc, etc.)
- `configuration` - WSUS-Einstellungen, AU-Optionen
- `updates` - Historie, letzte erfolgreiche Installation, ausstehende Updates
- `storage` - SoftwareDistribution Ordnergröße
- `errors` - Fehler aus Event Log (letzte 7 Tage)
- `connectivity` - Erreichbarkeit der Update-Server
- `issues` - Array mit erkannten Problemen
- `status` - OK / WARNING / CRITICAL

### Erkenntnisse aus CWWS12-Analyse (07.01.2026)
- `patches_last_installed` im Agent-Endpoint zeigt Scan-Zeitpunkt, nicht Install-Zeitpunkt
- Echtes Installationsdatum kommt aus `date_installed` Feld der einzelnen Patches
- OS Build-Nummer kann als Indikator für Update-Status verwendet werden
- TacticalRMM API bietet kein Ereignis-Protokoll für Windows Update Scans

### TacticalRMM Windows Update Verhalten
- **TRMM setzt AUOptions=1** bei Agent-Installation → Updates werden von TRMM verwaltet
- AUOptions=1 ist daher **kein Problem** bei TRMM-verwalteten Systemen
- BITS-Dienst startet on-demand → "Stopped" ist normal
- TRMM prüft Patch-Policy alle 8 Stunden
- "Other" Kategorie = reguläre monatliche Updates (Microsoft-Benennung)
- Wenn Agent offline bei Patch-Zeitpunkt → kein "install when online"

### Echte Probleme erkennen
| Befund | Bei TRMM-System | Ohne TRMM |
|--------|-----------------|-----------|
| AUOptions=1 | ✅ Normal | ❌ Problem |
| BITS Stopped | ✅ Normal | ✅ Normal (on-demand) |
| 403 von update.microsoft.com | ❌ Problem | ❌ Problem |
| Keine erfolgreichen Updates | ⚠️ Prüfen | ⚠️ Prüfen |
| Kritische Updates pending | ❌ Problem | ❌ Problem |

### Nächste Schritte
- [ ] JSON-Output des Diagnostics-Skripts in ERPNext verarbeiten
- [ ] Automatisches Ausführen des Skripts bei Problemerkennung
- [ ] Ergebnisse im Detail-Modal der MSP Documentation anzeigen
