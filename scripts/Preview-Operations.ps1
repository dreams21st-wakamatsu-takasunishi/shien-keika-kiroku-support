param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$previewRepo = Split-Path -Parent $PSScriptRoot
$previewUrl = 'http://127.0.0.1:3014/tests/fixtures/operations-workspace.html'
function Test-OperationsPreview {
  try {
    $previewResponse = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 2
    return $previewResponse.StatusCode -eq 200 -and $previewResponse.Content.Contains('operations-workspace.tsx')
  } catch { return $false }
}
try {
  if (-not (Test-OperationsPreview)) {
    if (Get-NetTCPConnection -LocalPort 3014 -State Listen -ErrorAction SilentlyContinue) {
      throw '確認用のポートを別のアプリが使用しています。Codexに確認画面の再起動を依頼してください。'
    }
    $previewLogs = Join-Path $previewRepo 'output'
    New-Item -ItemType Directory -Path $previewLogs -Force | Out-Null
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', 'npm.cmd run dev -- --port 3014 --host 127.0.0.1' -WorkingDirectory $previewRepo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewLogs 'operations-preview.out.log') -RedirectStandardError (Join-Path $previewLogs 'operations-preview.err.log') | Out-Null
    $previewReady = $false
    for ($previewAttempt = 0; $previewAttempt -lt 20; $previewAttempt++) {
      if (Test-OperationsPreview) { $previewReady = $true; break }
      Start-Sleep -Milliseconds 500
    }
    if (-not $previewReady) { throw '確認画面を起動できませんでした。Codexに再起動を依頼してください。' }
  }
  if (-not $NoOpen) { Start-Process $previewUrl }
} catch {
  Write-Host $_.Exception.Message
  Read-Host 'Enterキーで閉じます'
  exit 1
}
