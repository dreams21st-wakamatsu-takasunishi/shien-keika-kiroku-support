[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# Local prerequisites only. Never reads credentials, dumps data or installs software.
$tools = [ordered]@{}
foreach ($toolName in @('docker', 'pg_dump', 'psql')) {
    $tools[$toolName] = [bool](Get-Command $toolName -ErrorAction SilentlyContinue)
}
$encryption = 'unknown'
try {
    if (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue) {
        $volume = Get-BitLockerVolume -MountPoint 'C:' -ErrorAction Stop
        $encryption = [string]$volume.ProtectionStatus
    }
} catch { $encryption = 'not-verifiable-with-current-permissions' }
[ordered]@{
    format = 'd-support-backup-readiness-v1'
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    tools = $tools
    systemDriveProtection = $encryption
    approvedDestination = $false
    productionBackupReady = $false
    realDataExported = $false
    note = 'Choose and verify an approved encrypted destination and restore procedure before exporting real data.'
} | ConvertTo-Json -Depth 3
