#Requires -Version 5.1
<#
.SYNOPSIS
    Windows Update Diagnostics Script - JSON Output
.DESCRIPTION
    Sammelt Windows Update Diagnoseinformationen und gibt sie als JSON aus.
    Berücksichtigt TacticalRMM-verwaltete Systeme (AUOptions=1 ist dort normal).
.NOTES
    Version: 2.2
    Datum: 2026-01-07
    Output: JSON
    Changelog: Fixed connectivity check - use download.windowsupdate.com instead of SOAP endpoints
#>

$ErrorActionPreference = "SilentlyContinue"

# Detect TacticalRMM Agent
$tacticalInstalled = $false
$tacticalService = Get-Service -Name "tacticalrmm" -ErrorAction SilentlyContinue
if ($tacticalService) {
    $tacticalInstalled = $true
}

# Result object
$result = @{
    hostname = $env:COMPUTERNAME
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    managed_by = @{
        tactical_rmm = $tacticalInstalled
        tactical_service_status = if ($tacticalService) { $tacticalService.Status.ToString() } else { $null }
    }
    os = @{
        caption = ""
        build = ""
        version = ""
    }
    services = @()
    configuration = @{
        wsus_server = $null
        au_options = $null
        au_options_text = ""
        use_wsus = $false
        policies = @{}
    }
    updates = @{
        history_count = 0
        last_success = $null
        days_since_last_success = $null
        pending_count = 0
        pending_critical = 0
        pending_important = 0
        pending_driver = 0
        pending_list = @()
        recent_history = @()
    }
    storage = @{
        software_distribution_mb = 0
        download_folder_mb = 0
        datastore_mb = 0
    }
    errors = @()
    connectivity = @()
    issues = @()
    status = "OK"
}

# OS Info
try {
    $osInfo = Get-CimInstance Win32_OperatingSystem
    $result.os.caption = $osInfo.Caption
    $result.os.version = $osInfo.Version
    $ntVersion = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue
    $result.os.build = "$([System.Environment]::OSVersion.Version.Build).$($ntVersion.UBR)"
} catch {}

# Services
# Note: BITS and other services start on-demand, so we check StartType not current Status
$serviceList = @(
    @{Name="wuauserv"; DisplayName="Windows Update"; Critical=$true; MustRun=$false},
    @{Name="bits"; DisplayName="BITS"; Critical=$false; MustRun=$false},  # Starts on demand
    @{Name="cryptsvc"; DisplayName="CryptSvc"; Critical=$false; MustRun=$false},
    @{Name="msiserver"; DisplayName="MSIServer"; Critical=$false; MustRun=$false},
    @{Name="TrustedInstaller"; DisplayName="TrustedInstaller"; Critical=$false; MustRun=$false}
)

foreach ($svc in $serviceList) {
    $service = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
    $startType = (Get-CimInstance Win32_Service -Filter "Name='$($svc.Name)'" -ErrorAction SilentlyContinue).StartMode

    # Service is OK if: exists AND (running OR start type is Manual/Auto, not Disabled)
    $isDisabled = ($startType -eq "Disabled")
    $isOk = $service -and (-not $isDisabled)

    $svcResult = @{
        name = $svc.Name
        display_name = $svc.DisplayName
        status = if ($service) { $service.Status.ToString() } else { "NotFound" }
        start_type = $startType
        critical = $svc.Critical
        disabled = $isDisabled
        ok = $isOk
    }
    $result.services += $svcResult

    # Only flag as issue if service is disabled or not found
    if ($svc.Critical -and (-not $service -or $isDisabled)) {
        $result.issues += "Service '$($svc.DisplayName)' ist deaktiviert oder nicht vorhanden"
    }
}

# Configuration
$wuPolicyPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate"
if (Test-Path $wuPolicyPath) {
    $wuPolicy = Get-ItemProperty -Path $wuPolicyPath -ErrorAction SilentlyContinue
    $result.configuration.wsus_server = $wuPolicy.WUServer
    $result.configuration.use_wsus = ($wuPolicy.UseWUServer -eq 1)

    $auPath = "$wuPolicyPath\AU"
    if (Test-Path $auPath) {
        $auPolicy = Get-ItemProperty -Path $auPath -ErrorAction SilentlyContinue
        $result.configuration.au_options = $auPolicy.AUOptions
        $result.configuration.policies = @{
            no_auto_update = $auPolicy.NoAutoUpdate
            au_options = $auPolicy.AUOptions
            scheduled_install_day = $auPolicy.ScheduledInstallDay
            scheduled_install_time = $auPolicy.ScheduledInstallTime
        }

        # Translate AUOptions
        $auText = switch ($auPolicy.AUOptions) {
            1 { "Deaktiviert (RMM-verwaltet)" }
            2 { "Benachrichtigen vor Download" }
            3 { "Automatisch downloaden, benachrichtigen vor Installation" }
            4 { "Automatisch downloaden und installieren" }
            5 { "Lokaler Admin kann Einstellung wählen" }
            default { "Nicht konfiguriert" }
        }
        $result.configuration.au_options_text = $auText

        # AUOptions=1 is EXPECTED when TacticalRMM is installed (TRMM manages updates)
        # Only flag as issue if AUOptions=1 AND no RMM is installed
        if ($auPolicy.AUOptions -eq 1 -and -not $tacticalInstalled) {
            $result.issues += "Windows Update ist per Policy deaktiviert (AUOptions=1) ohne RMM-Verwaltung"
        }
    }
}

# Update History and Pending
try {
    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $result.updates.history_count = $Searcher.GetTotalHistoryCount()

    # Recent history
    if ($result.updates.history_count -gt 0) {
        $History = $Searcher.QueryHistory(0, [Math]::Min(10, $result.updates.history_count))
        foreach ($Update in $History) {
            $resultCode = switch ($Update.ResultCode) {
                0 { "NotStarted" }
                1 { "InProgress" }
                2 { "Succeeded" }
                3 { "SucceededWithErrors" }
                4 { "Failed" }
                5 { "Aborted" }
                default { "Unknown" }
            }

            $result.updates.recent_history += @{
                date = $Update.Date.ToString("yyyy-MM-ddTHH:mm:ss")
                title = $Update.Title
                result = $resultCode
                succeeded = ($Update.ResultCode -eq 2)
            }
        }

        # Find last success
        $allHistory = $Searcher.QueryHistory(0, $result.updates.history_count)
        foreach ($Update in $allHistory) {
            if ($Update.ResultCode -eq 2) {
                $result.updates.last_success = $Update.Date.ToString("yyyy-MM-ddTHH:mm:ss")
                $result.updates.days_since_last_success = [math]::Round(((Get-Date) - $Update.Date).TotalDays)
                break
            }
        }
    }

    if (-not $result.updates.last_success) {
        $result.issues += "Kein erfolgreiches Update in der Historie gefunden"
    } elseif ($result.updates.days_since_last_success -gt 60) {
        $result.issues += "Letztes erfolgreiches Update vor $($result.updates.days_since_last_success) Tagen"
    }

    # Pending updates
    $SearchResult = $Searcher.Search("IsInstalled=0")
    $result.updates.pending_count = $SearchResult.Updates.Count

    foreach ($Update in $SearchResult.Updates) {
        $severity = if ($Update.MsrcSeverity) { $Update.MsrcSeverity } else { "Unspecified" }
        $isDriver = $Update.Categories | Where-Object { $_.Name -like "*Driver*" }

        $pendingUpdate = @{
            title = $Update.Title
            kb = ($Update.KBArticleIDs -join ",")
            severity = $severity
            size_mb = [math]::Round($Update.MaxDownloadSize / 1MB, 1)
            downloaded = $Update.IsDownloaded
            is_driver = ($null -ne $isDriver)
            categories = @($Update.Categories | ForEach-Object { $_.Name })
        }
        $result.updates.pending_list += $pendingUpdate

        if ($severity -eq "Critical") { $result.updates.pending_critical++ }
        elseif ($severity -eq "Important") { $result.updates.pending_important++ }
        if ($isDriver) { $result.updates.pending_driver++ }
    }

    if ($result.updates.pending_critical -gt 0) {
        $result.issues += "$($result.updates.pending_critical) kritische Updates ausstehend"
    }
} catch {
    $result.errors += "Update-Abfrage fehlgeschlagen: $_"
}

# Storage
$sdPath = "$env:SystemRoot\SoftwareDistribution"
if (Test-Path $sdPath) {
    $sdSize = (Get-ChildItem -Path $sdPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $result.storage.software_distribution_mb = [math]::Round($sdSize / 1MB, 2)

    $dlPath = "$sdPath\Download"
    if (Test-Path $dlPath) {
        $dlSize = (Get-ChildItem -Path $dlPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $result.storage.download_folder_mb = [math]::Round($dlSize / 1MB, 2)
    }

    $dbPath = "$sdPath\DataStore\DataStore.edb"
    if (Test-Path $dbPath) {
        $result.storage.datastore_mb = [math]::Round((Get-Item $dbPath).Length / 1MB, 2)
        if ($result.storage.datastore_mb -gt 500) {
            $result.issues += "DataStore.edb sehr groß ($($result.storage.datastore_mb) MB)"
        }
    }
}

# Event Log Errors
try {
    $StartDate = (Get-Date).AddDays(-7)
    $WUErrors = Get-WinEvent -FilterHashtable @{
        LogName = 'System'
        ProviderName = 'Microsoft-Windows-WindowsUpdateClient'
        Level = 2,3
        StartTime = $StartDate
    } -MaxEvents 5 -ErrorAction SilentlyContinue

    foreach ($Event in $WUErrors) {
        $result.errors += @{
            date = $Event.TimeCreated.ToString("yyyy-MM-ddTHH:mm:ss")
            level = if ($Event.Level -eq 2) { "Error" } else { "Warning" }
            id = $Event.Id
            message = ($Event.Message -split "`n")[0]
        }
    }
} catch {}

# Connectivity
# Note: update.microsoft.com and windowsupdate.microsoft.com are SOAP/WCF services
# They don't respond to HTTP GET requests - use download URLs instead
$testUrls = @(
    @{url="https://www.microsoft.com"; name="Microsoft"; critical=$false},
    @{url="http://download.windowsupdate.com"; name="Windows Update Download"; critical=$true},
    @{url="https://www.catalog.update.microsoft.com"; name="Windows Update Catalog"; critical=$false},
    @{url="https://download.microsoft.com"; name="Microsoft Download"; critical=$false}
)

foreach ($test in $testUrls) {
    try {
        $response = Invoke-WebRequest -Uri $test.url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $result.connectivity += @{
            name = $test.name
            url = $test.url
            status = $response.StatusCode
            ok = $true
        }
    } catch {
        $result.connectivity += @{
            name = $test.name
            url = $test.url
            status = 0
            error = $_.Exception.Message
            ok = $false
        }
        if ($test.critical) {
            $result.issues += "Keine Verbindung zu $($test.name)"
        }
    }
}

# Final status determination
# Critical issues: connectivity problems, critical pending updates, disabled services
# Warning issues: old updates, many pending updates
if ($result.issues.Count -gt 0) {
    $hasCritical = $result.issues | Where-Object {
        $_ -match "kritisch|keine Verbindung|deaktiviert oder nicht vorhanden|ohne RMM"
    }
    $result.status = if ($hasCritical) { "CRITICAL" } else { "WARNING" }
} else {
    $result.status = "OK"
}

# Add summary
$result.summary = @{
    total_issues = $result.issues.Count
    is_rmm_managed = $tacticalInstalled
    needs_attention = ($result.status -ne "OK")
    connectivity_ok = ($result.connectivity | Where-Object { -not $_.ok }).Count -eq 0
}

# Output as JSON
$result | ConvertTo-Json -Depth 5 -Compress
