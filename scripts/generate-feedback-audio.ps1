param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\assets\audio')
)

$sampleRate = 22050

function Write-WavFile {
  param(
    [string]$Path,
    [double[]]$Samples
  )

  $dataLength = $Samples.Length * 2
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create)
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
    $writer.Write([int](36 + $dataLength))
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
    $writer.Write([int]16)
    $writer.Write([int16]1)
    $writer.Write([int16]1)
    $writer.Write([int]$sampleRate)
    $writer.Write([int]($sampleRate * 2))
    $writer.Write([int16]2)
    $writer.Write([int16]16)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
    $writer.Write([int]$dataLength)
    foreach ($sample in $Samples) {
      $clamped = [Math]::Max(-1, [Math]::Min(1, $sample))
      $writer.Write([int16]([Math]::Round($clamped * 32767)))
    }
  }
  finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$celebrationLength = [int]($sampleRate * 0.86)
$celebration = [double[]]::new($celebrationLength)
for ($index = 0; $index -lt $celebrationLength; $index += 1) {
  $time = $index / $sampleRate
  $attack = [Math]::Min(1, $time / 0.025)
  $release = [Math]::Pow([Math]::Max(0, 1 - ($time / 0.86)), 2.1)
  $first = [Math]::Sin(2 * [Math]::PI * 523.25 * $time)
  $secondStart = [Math]::Max(0, $time - 0.16)
  $second = if ($time -ge 0.16) {
    [Math]::Sin(2 * [Math]::PI * 659.25 * $secondStart)
  } else { 0 }
  $warmth = [Math]::Sin(2 * [Math]::PI * 261.63 * $time)
  $celebration[$index] = 0.22 * $attack * $release * (
    0.5 * $first + 0.38 * $second + 0.12 * $warmth
  )
}

$clickLength = [int]($sampleRate * 0.13)
$click = [double[]]::new($clickLength)
$noiseState = [uint32]2463534242
for ($index = 0; $index -lt $clickLength; $index += 1) {
  $time = $index / $sampleRate
  $envelope = [Math]::Exp(-42 * $time)
  $noiseState = [uint32](($noiseState * 1664525 + 1013904223) -band 0xffffffffL)
  $noise = (($noiseState / [double][uint32]::MaxValue) * 2) - 1
  $body = [Math]::Sin(2 * [Math]::PI * (620 - 900 * $time) * $time)
  $click[$index] = 0.18 * $envelope * (0.55 * $noise + 0.45 * $body)
}

Write-WavFile -Path (Join-Path $OutputDirectory 'redemption-success.wav') -Samples $celebration
Write-WavFile -Path (Join-Path $OutputDirectory 'stamp-click.wav') -Samples $click
