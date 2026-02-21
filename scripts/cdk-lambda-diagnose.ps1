param(
  [switch]$UseWsl,
  [switch]$UseBash
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$BashScriptPath = Join-Path $ScriptDir 'cdk-lambda-diagnose.sh'

function Test-WslReady {
  if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
    return $false
  }

  try {
    $distros = wsl -l -q 2>$null
    return -not [string]::IsNullOrWhiteSpace(($distros | Out-String))
  }
  catch {
    return $false
  }
}

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host "`n$Label"
  try {
    & $Action
  }
  catch {
    Write-Warning $_
  }
}

Set-Location $RepoRoot

if ($UseWsl) {
  if (-not (Test-WslReady)) {
    Write-Error @"
WSL은 설치되었지만 사용 가능한 Linux 배포판이 없거나, WSL이 아직 초기화되지 않았습니다.

PowerShell에서 아래를 먼저 1회 실행하세요:
  wsl --install -d Ubuntu

설치 후 PC 재시작(또는 새 터미널) 뒤 다시 실행:
  .\scripts\cdk-lambda-diagnose.ps1 -UseWsl
"@
  }

  $wslInputPath = $BashScriptPath -replace '\\', '/'
  $linuxScriptPath = (wsl wslpath -a -- "$wslInputPath" 2>$null).Trim()

  if ([string]::IsNullOrWhiteSpace($linuxScriptPath)) {
    Write-Error "WSL 경로 변환 실패: $BashScriptPath"
  }

  Write-Host "[info] Running diagnostic script through WSL..."
  wsl bash "$linuxScriptPath"
  exit $LASTEXITCODE
}

if ($UseBash) {
  if (-not (Get-Command bash -ErrorAction SilentlyContinue)) {
    Write-Error "'bash' command not found. Use default mode (PowerShell native) or install Git Bash."
  }

  Write-Host "[info] Running diagnostic script through bash..."
  bash "$BashScriptPath"
  exit $LASTEXITCODE
}

Write-Host "[info] Running diagnostic steps in PowerShell (기본 모드)"

Invoke-Step "[1/7] Tool versions" {
  node -v
  npm -v
  cdk --version
  aws --version
}

Invoke-Step "[2/7] AWS caller identity" {
  aws sts get-caller-identity
}

Invoke-Step "[3/7] AWS configure list" {
  aws configure list
}

Invoke-Step "[4/7] Install deps" {
  if (Test-Path (Join-Path $RepoRoot 'package-lock.json')) {
    npm ci
  }
  elseif (Test-Path (Join-Path $RepoRoot 'package.json')) {
    Write-Host "[warn] package-lock.json 없음 -> npm install 실행"
    npm install
  }
  else {
    Write-Host "[warn] package.json 없음 -> 설치 단계 건너뜀"
  }
}

Invoke-Step "[5/7] Build" {
  if (Test-Path (Join-Path $RepoRoot 'package.json')) {
    $pkg = Get-Content (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json
    if ($pkg.scripts -and $pkg.scripts.build) {
      npm run build
    }
    else {
      Write-Host "[warn] package.json에 build 스크립트가 없어 건너뜀"
    }
  }
  else {
    Write-Host "[warn] package.json 없음 -> build 단계 건너뜀"
  }
}

Invoke-Step "[6/7] CDK synth (verbose)" {
  cdk synth -v
}

Invoke-Step "[7/7] CDK deploy (verbose, no-approval)" {
  cdk deploy -v --require-approval never
}

Write-Host "`nDone. 위 출력에서 처음 실패하는 단계의 에러 메시지를 확인하세요."