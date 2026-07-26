$ErrorActionPreference = "Stop"

$entryRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$entryItem = Get-Item -LiteralPath $entryRoot
$projectRoot = if ($entryItem.LinkType -eq "Junction" -and $entryItem.Target) {
  [string]$entryItem.Target[0]
} else {
  $entryRoot
}

$siteUrl = "http://localhost:3000"

function Get-SiteState {
  try {
    $response = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 2
    if (
      $response.StatusCode -eq 200 -and
      $response.Headers["X-Powered-By"] -eq "Next.js" -and
      $response.Content -match 'href="/upload"'
    ) {
      return "ready"
    }

    return "occupied"
  } catch {
    if ($null -ne $_.Exception.Response) {
      return "occupied"
    }

    return "stopped"
  }
}

$siteState = Get-SiteState

if ($siteState -eq "occupied") {
  Write-Error "Port 3000 is already used by another service. Close that service and run this launcher again."
  exit 1
}

if ($siteState -eq "stopped") {
  if (-not (Get-Command "npm.cmd" -ErrorAction SilentlyContinue)) {
    Write-Error "npm.cmd was not found. Install Node.js or add it to PATH first."
    exit 1
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot ".next\BUILD_ID"))) {
    Write-Host "The production build is missing. Building the site first..."
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  Write-Host "Starting the site..."
  Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList "/k", "npm.cmd run start -- -p 3000" `
    -WorkingDirectory $projectRoot `
    -WindowStyle Normal

  $siteState = "stopped"
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    $siteState = Get-SiteState
    if ($siteState -ne "stopped") {
      break
    }
  }

  if ($siteState -ne "ready") {
    Write-Error "The site did not become ready. Check the server window for details."
    exit 1
  }
}

Write-Host "Opening $siteUrl"
Start-Process $siteUrl
