# Starts both the Catan server and a Cloudflare quick tunnel in two terminal windows.
# Usage: open PowerShell in the catan folder and run:  .\start.ps1
#
# After it runs you'll have:
#   Window 1: the Catan server (keep open)
#   Window 2: cloudflared — the public URL appears in the box near the top
# Share that URL + your room code with friends.

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "Starting Catan server on http://localhost:3005 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$here'; node server.js"

Start-Sleep -Seconds 2

Write-Host "Starting Cloudflare tunnel ..." -ForegroundColor Yellow
Write-Host "Watch for the https://xxx.trycloudflare.com line and share that URL." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cloudflared tunnel --url http://localhost:3005"

Write-Host ""
Write-Host "Both windows are now open. Close them (or press Ctrl+C in each) when you're done playing." -ForegroundColor Green
