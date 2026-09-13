param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$EasArgs
)

$ErrorActionPreference = 'Stop'

if (-not $EasArgs -or $EasArgs.Count -eq 0) {
  Write-Error "Usage: .\scripts\eas-run.ps1 <eas arguments>"
  exit 1
}

function Get-ArgValue {
  param(
    [string[]]$ArgsList,
    [string]$Name
  )

  for ($index = 0; $index -lt $ArgsList.Count; $index++) {
    if ($ArgsList[$index] -eq $Name -and ($index + 1) -lt $ArgsList.Count) {
      return $ArgsList[$index + 1]
    }
  }

  return $null
}

function Get-EasProfile {
  param(
    [string[]]$ArgsList
  )

  return Get-ArgValue -ArgsList $ArgsList -Name '--profile'
}

function Assert-CleanGit {
  $status = & git status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw 'Cannot inspect git status before EAS build.'
  }

  if ($status) {
    Write-Error @"
Git working tree is dirty. Commit the build inputs before EAS build so the native config, Convex contract, and embedded bundle can be traced and verified.
$status
"@
    exit 1
  }
}

function Invoke-PrebuildGate {
  param(
    [string]$Profile
  )

  $scriptName = $null
  switch ($Profile) {
    'production' { $scriptName = 'prebuild:production' }
    'preview' { $scriptName = 'prebuild:preview' }
    'development' { $scriptName = 'prebuild:preview' }
    'ios-simulator' { $scriptName = 'prebuild:preview' }
    default {
      Write-Error "Unknown EAS build profile '$Profile'. The Convex prebuild gate requires preview or production mapping."
      exit 1
    }
  }

  & bun run $scriptName
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if ($EasArgs[0] -eq 'build') {
  $profile = Get-EasProfile -ArgsList $EasArgs
  if (-not $profile) {
    Write-Error 'EAS build requires --profile so the Convex, RTL, and billing prebuild gates can run.'
    exit 1
  }

  Assert-CleanGit
  Invoke-PrebuildGate -Profile $profile
}

function Get-NodeMajor {
  $raw = (& node -v).Trim()
  if (-not $raw) {
    throw 'Failed to detect Node.js version.'
  }

  return [int]($raw.TrimStart('v').Split('.')[0])
}

function Ensure-Node22 {
  $toolsDir = Join-Path $PSScriptRoot '..\.tools'
  if (-not (Test-Path $toolsDir)) {
    New-Item -ItemType Directory -Path $toolsDir | Out-Null
  }

  $shaPath = Join-Path $toolsDir 'node22-shasums.txt'
  & curl.exe -fsSL 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -o $shaPath

  $zipLine = Get-Content $shaPath |
    Where-Object { $_ -match 'node-v22\..*-win-x64\.zip' } |
    Select-Object -First 1

  if (-not $zipLine) {
    throw 'Could not locate latest Node 22 Windows archive.'
  }

  $zipName = ($zipLine -split '\s+')[-1]
  $archivePath = Join-Path $toolsDir $zipName
  $folderName = [System.IO.Path]::GetFileNameWithoutExtension($zipName)
  $nodeRoot = Join-Path $toolsDir $folderName
  $nodeExe = Join-Path $nodeRoot 'node.exe'

  if (-not (Test-Path $nodeExe)) {
    & curl.exe -fsSL "https://nodejs.org/dist/latest-v22.x/$zipName" -o $archivePath
    Expand-Archive -Path $archivePath -DestinationPath $toolsDir -Force
  }

  return $nodeExe
}

function Get-EasRunScriptPath {
  if (-not $env:APPDATA) {
    return $null
  }

  $globalEasPath = Join-Path $env:APPDATA 'npm\node_modules\eas-cli\bin\run'
  if (Test-Path $globalEasPath) {
    return $globalEasPath
  }

  return $null
}

$nodeMajor = Get-NodeMajor
$easRunScript = Get-EasRunScriptPath

if ($nodeMajor -ge 24 -and $env:OS -eq 'Windows_NT') {
  $nodeExe = Ensure-Node22

  if ($easRunScript) {
    & $nodeExe $easRunScript @EasArgs
  } else {
    & eas @EasArgs
  }
} else {
  & eas @EasArgs
}

exit $LASTEXITCODE
