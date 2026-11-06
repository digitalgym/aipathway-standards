# Restart Grok Bot with its Chrome debugging port open (dev mode).
# powershell -ExecutionPolicy Bypass -File tools/grok-bot/start.ps1 [-Normal]
# -Normal restarts it without the port. Do that when you are finished: while
# the port is open, any program on this PC can drive the app as you.
param([switch]$Normal, [int]$Port = 9333)
$exe = "$env:LOCALAPPDATA\Programs\Grok Bot\Grok Bot.exe"
Get-Process -Name 'Grok Bot' -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 10
if ($Normal) { Start-Process $exe } else { Start-Process $exe -ArgumentList "--remote-debugging-port=$Port" }
Start-Sleep -Seconds 25
if (-not $Normal) {
  try { Invoke-WebRequest "http://127.0.0.1:$Port/json/version" -UseBasicParsing | Out-Null; "dev mode on port $Port" }
  catch { "port $Port not answering yet; wait a few seconds and retry" }
}
