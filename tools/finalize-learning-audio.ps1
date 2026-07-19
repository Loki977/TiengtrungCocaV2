param(
  [Parameter(Mandatory = $true)][int]$GeneratorProcessId,
  [Parameter(Mandatory = $false)][string]$FfprobePath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir = Join-Path $root 'assets/audio/learning/logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'finalize-static-audio.log'

try {
  Wait-Process -Id $GeneratorProcessId
  $process = Get-Process -Id $GeneratorProcessId -ErrorAction SilentlyContinue
  if ($process) { throw "Generator process did not exit: $GeneratorProcessId" }

  node tools/build-learning-audio-inventory.mjs --check
  if ($LASTEXITCODE -ne 0) { throw 'Inventory changed while audio was being generated; pruning is intentionally skipped.' }

  $plan = 'reports/audio-finalizer-prune-plan.json'
  node tools/build-learning-audio-runtime.mjs --write --plan $plan
  if ($LASTEXITCODE -ne 0) { throw 'Runtime manifest/index build failed.' }

  node tools/verify-learning-static-audio.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Static audio verification failed before pruning.' }
  node tools/audit-static-audio-coverage.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Audio coverage is incomplete; pruning and WAV cleanup are intentionally skipped.' }

  node tools/build-learning-audio-runtime.mjs --apply-prune --plan $plan
  if ($LASTEXITCODE -ne 0) { throw 'Verified audio prune failed.' }
  node tools/verify-learning-static-audio.mjs --require-no-unreferenced
  if ($LASTEXITCODE -ne 0) { throw 'Static audio verification failed after pruning.' }

  # Source WAV is disposable only after every static MP3 has passed the
  # manifest/hash/codec/index/coverage gates above.  Pinyin HSK1 lives in a
  # different directory and is deliberately never included here.
  $cacheRoot = Join-Path $root 'assets/audio/learning/cache'
  $wavFiles = @()
  if (Test-Path -LiteralPath $cacheRoot) {
    $wavFiles = @(Get-ChildItem -LiteralPath $cacheRoot -Filter '*.wav' -File -ErrorAction Stop)
  }
  foreach ($wav in $wavFiles) {
    if ($wav.DirectoryName -ne $cacheRoot) { throw "Refusing to delete outside learning cache: $($wav.FullName)" }
    Remove-Item -LiteralPath $wav.FullName -Force
  }
  Add-Content -Path $log -Value "$(Get-Date -Format o) COMPLETE: built sharded runtime index, passed coverage, pruned only verified MP3 files, removed $($wavFiles.Count) verified learning-cache WAV files."
} catch {
  Add-Content -Path $log -Value "$(Get-Date -Format o) FAILED: $($_.Exception.Message)"
  exit 1
}
