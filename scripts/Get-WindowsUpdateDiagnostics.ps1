#Requires -Version 5.1
<#
.SYNOPSIS
    Windows Update Diagnostics Script for TacticalRMM
.DESCRIPTION
    Sammelt umfassende Diagnoseinformationen zum Windows Update Status.
    Ausgabe erfolgt als strukturierter Text fuer TacticalRMM.
.NOTES
    Version: 1.0
    Datum: 2026-01-07
    Fuer: MSP Documentation / TacticalRMM
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "SilentlyContinue"

function Write-Section {
    param([string]$Title)
    Write-Output ""
    Write-Output "=" * 60
    Write-Output "  $Title"
    Write-Output "=" * 60
}

function Write-SubSection {
    param([string]$Title)
    Write-Output ""
    Write-Output "--- $Title ---"
}

# Header
Write-Output "WINDOWS UPDATE DIAGNOSTICS"
Write-Output "Hostname: $env:COMPUTERNAME"
Write-Output "Datum: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Output "OS: $((Get-CimInstance Win32_OperatingSystem).Caption)"
Write-Output "Build: $([System.Environment]::OSVersion.Version.Build).$((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').UBR)"

# ============================================================
# 1. WINDOWS UPDATE DIENSTE
# ============================================================
Write-Section "1. WINDOWS UPDATE DIENSTE"

$services = @(
    @{Name="wuauserv"; DisplayName="Windows Update"},
    @{Name="bits"; DisplayName="Background Intelligent Transfer"},
    @{Name="cryptsvc"; DisplayName="Cryptographic Services"},
    @{Name="msiserver"; DisplayName="Windows Installer"},
    @{Name="TrustedInstaller"; DisplayName="Windows Modules Installer"}
)

foreach ($svc in $services) {
    $service = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
    if ($service) {
        $startType = (Get-CimInstance Win32_Service -Filter "Name='$($svc.Name)'").StartMode
        $status = if ($service.Status -eq "Running") { "[OK]" } else { "[!!]" }
        Write-Output "$status $($svc.DisplayName) ($($svc.Name)): $($service.Status) / StartType: $startType"
    } else {
        Write-Output "[??] $($svc.DisplayName) ($($svc.Name)): Nicht gefunden"
    }
}

# ============================================================
# 2. WSUS / WINDOWS UPDATE KONFIGURATION
# ============================================================
Write-Section "2. WINDOWS UPDATE KONFIGURATION"

Write-SubSection "Registry: WindowsUpdate Policy"
$wuPolicyPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate"
if (Test-Path $wuPolicyPath) {
    $wuPolicy = Get-ItemProperty -Path $wuPolicyPath -ErrorAction SilentlyContinue
    Write-Output "WUServer: $($wuPolicy.WUServer)"
    Write-Output "WUStatusServer: $($wuPolicy.WUStatusServer)"
    Write-Output "UseWUServer: $($wuPolicy.UseWUServer)"
    Write-Output "DoNotConnectToWindowsUpdateInternetLocations: $($wuPolicy.DoNotConnectToWindowsUpdateInternetLocations)"

    $auPath = "$wuPolicyPath\AU"
    if (Test-Path $auPath) {
        $auPolicy = Get-ItemProperty -Path $auPath -ErrorAction SilentlyContinue
        Write-Output ""
        Write-Output "AU Policy:"
        Write-Output "  NoAutoUpdate: $($auPolicy.NoAutoUpdate)"
        Write-Output "  AUOptions: $($auPolicy.AUOptions)"
        Write-Output "  ScheduledInstallDay: $($auPolicy.ScheduledInstallDay)"
        Write-Output "  ScheduledInstallTime: $($auPolicy.ScheduledInstallTime)"
        Write-Output "  UseWUServer: $($auPolicy.UseWUServer)"
    }
} else {
    Write-Output "Keine WSUS/GPO Konfiguration gefunden (Standard Windows Update)"
}

Write-SubSection "Registry: Windows Update Settings"
$wuSettingsPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate"
if (Test-Path $wuSettingsPath) {
    $wuSettings = Get-ItemProperty -Path $wuSettingsPath -ErrorAction SilentlyContinue
    Write-Output "AccountDomainSid: $($wuSettings.AccountDomainSid)"
    Write-Output "SusClientId: $($wuSettings.SusClientId)"
}

# ============================================================
# 3. WINDOWS UPDATE HISTORIE
# ============================================================
Write-Section "3. WINDOWS UPDATE HISTORIE (letzte 20)"

try {
    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $HistoryCount = $Searcher.GetTotalHistoryCount()

    Write-Output "Gesamte Historie-Eintraege: $HistoryCount"
    Write-Output ""

    if ($HistoryCount -gt 0) {
        $History = $Searcher.QueryHistory(0, [Math]::Min(20, $HistoryCount))

        foreach ($Update in $History) {
            $ResultCode = switch ($Update.ResultCode) {
                0 { "NotStarted" }
                1 { "InProgress" }
                2 { "Succeeded" }
                3 { "SucceededWithErrors" }
                4 { "Failed" }
                5 { "Aborted" }
                default { "Unknown" }
            }

            $Status = if ($Update.ResultCode -eq 2) { "[OK]" } else { "[!!]" }
            $Date = $Update.Date.ToString("yyyy-MM-dd HH:mm")
            $Title = $Update.Title
            if ($Title.Length -gt 60) { $Title = $Title.Substring(0, 57) + "..." }

            Write-Output "$Status [$Date] $ResultCode"
            Write-Output "    $Title"
        }
    }
} catch {
    Write-Output "Fehler beim Abrufen der Update-Historie: $_"
}

# ============================================================
# 4. AUSSTEHENDE UPDATES
# ============================================================
Write-Section "4. AUSSTEHENDE UPDATES"

try {
    $Searcher = $Session.CreateUpdateSearcher()
    $SearchResult = $Searcher.Search("IsInstalled=0")

    Write-Output "Ausstehende Updates: $($SearchResult.Updates.Count)"
    Write-Output ""

    if ($SearchResult.Updates.Count -gt 0) {
        foreach ($Update in $SearchResult.Updates) {
            $Severity = if ($Update.MsrcSeverity) { $Update.MsrcSeverity } else { "Unspecified" }
            $Size = [math]::Round($Update.MaxDownloadSize / 1MB, 1)

            Write-Output "[$Severity] $($Update.Title)"
            Write-Output "    KB: $($Update.KBArticleIDs -join ', ') | Groesse: ${Size}MB | Downloaded: $($Update.IsDownloaded)"
        }
    } else {
        Write-Output "Keine ausstehenden Updates gefunden."
    }
} catch {
    Write-Output "Fehler beim Suchen nach Updates: $_"
}

# ============================================================
# 5. LETZTE ERFOLGREICHE INSTALLATION
# ============================================================
Write-Section "5. LETZTE ERFOLGREICHE UPDATE-INSTALLATION"

try {
    $LastSuccess = $null
    $History = $Searcher.QueryHistory(0, $HistoryCount)

    foreach ($Update in $History) {
        if ($Update.ResultCode -eq 2) {
            $LastSuccess = $Update
            break
        }
    }

    if ($LastSuccess) {
        $DaysAgo = [math]::Round((Get-Date) - $LastSuccess.Date).TotalDays
        Write-Output "Datum: $($LastSuccess.Date.ToString('yyyy-MM-dd HH:mm:ss'))"
        Write-Output "Tage her: $DaysAgo"
        Write-Output "Update: $($LastSuccess.Title)"

        if ($DaysAgo -gt 60) {
            Write-Output ""
            Write-Output "[WARNUNG] Letztes erfolgreiches Update ist mehr als 60 Tage her!"
        }
    } else {
        Write-Output "Kein erfolgreiches Update in der Historie gefunden!"
    }
} catch {
    Write-Output "Fehler: $_"
}

# ============================================================
# 6. SOFTWAREDISTRIBUTION ORDNER
# ============================================================
Write-Section "6. SOFTWAREDISTRIBUTION STATUS"

$sdPath = "$env:SystemRoot\SoftwareDistribution"
if (Test-Path $sdPath) {
    $sdSize = (Get-ChildItem -Path $sdPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $sdSizeMB = [math]::Round($sdSize / 1MB, 2)

    Write-Output "Pfad: $sdPath"
    Write-Output "Groesse: ${sdSizeMB} MB"

    $downloadPath = "$sdPath\Download"
    if (Test-Path $downloadPath) {
        $dlSize = (Get-ChildItem -Path $downloadPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $dlSizeMB = [math]::Round($dlSize / 1MB, 2)
        Write-Output "Download-Ordner: ${dlSizeMB} MB"
    }

    $dataStorePath = "$sdPath\DataStore\DataStore.edb"
    if (Test-Path $dataStorePath) {
        $dbSize = [math]::Round((Get-Item $dataStorePath).Length / 1MB, 2)
        Write-Output "DataStore.edb: ${dbSize} MB"

        if ($dbSize -gt 500) {
            Write-Output "[WARNUNG] DataStore.edb ist sehr gross - Reset empfohlen"
        }
    }
} else {
    Write-Output "[FEHLER] SoftwareDistribution Ordner nicht gefunden!"
}

# ============================================================
# 7. WINDOWS UPDATE FEHLER (Event Log)
# ============================================================
Write-Section "7. WINDOWS UPDATE FEHLER (letzte 7 Tage)"

try {
    $StartDate = (Get-Date).AddDays(-7)
    $WUErrors = Get-WinEvent -FilterHashtable @{
        LogName = 'System'
        ProviderName = 'Microsoft-Windows-WindowsUpdateClient'
        Level = 2,3  # Error, Warning
        StartTime = $StartDate
    } -MaxEvents 10 -ErrorAction SilentlyContinue

    if ($WUErrors) {
        Write-Output "Gefundene Fehler/Warnungen: $($WUErrors.Count)"
        Write-Output ""

        foreach ($Event in $WUErrors) {
            $Level = if ($Event.Level -eq 2) { "[ERROR]" } else { "[WARN]" }
            Write-Output "$Level [$($Event.TimeCreated.ToString('yyyy-MM-dd HH:mm'))] ID:$($Event.Id)"
            Write-Output "    $($Event.Message.Split("`n")[0])"
        }
    } else {
        Write-Output "Keine Windows Update Fehler in den letzten 7 Tagen."
    }
} catch {
    Write-Output "Event Log konnte nicht abgefragt werden: $_"
}

# ============================================================
# 8. NETZWERK-KONNEKTIVITAET
# ============================================================
Write-Section "8. WINDOWS UPDATE KONNEKTIVITAET"

$testUrls = @(
    "https://www.microsoft.com",
    "https://update.microsoft.com",
    "https://windowsupdate.microsoft.com"
)

foreach ($url in $testUrls) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Output "[OK] $url (Status: $($response.StatusCode))"
    } catch {
        Write-Output "[!!] $url (Fehler: $($_.Exception.Message))"
    }
}

# ============================================================
# 9. ZUSAMMENFASSUNG
# ============================================================
Write-Section "9. ZUSAMMENFASSUNG"

$issues = @()

# Check services
$wuService = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
if ($wuService.Status -ne "Running") {
    $issues += "Windows Update Dienst laeuft nicht"
}

# Check last update age
if ($LastSuccess -and $DaysAgo -gt 60) {
    $issues += "Letztes Update vor mehr als $DaysAgo Tagen"
}

# Check WSUS
if ((Test-Path $wuPolicyPath) -and $wuPolicy.UseWUServer -eq 1) {
    $issues += "WSUS konfiguriert: $($wuPolicy.WUServer)"
}

# Check pending updates
if ($SearchResult -and $SearchResult.Updates.Count -gt 5) {
    $issues += "$($SearchResult.Updates.Count) ausstehende Updates"
}

if ($issues.Count -eq 0) {
    Write-Output "Status: OK - Keine offensichtlichen Probleme gefunden"
} else {
    Write-Output "Status: PROBLEME ERKANNT"
    Write-Output ""
    foreach ($issue in $issues) {
        Write-Output "  [!] $issue"
    }
}

Write-Output ""
Write-Output "=" * 60
Write-Output "  DIAGNOSTICS ENDE"
Write-Output "=" * 60
