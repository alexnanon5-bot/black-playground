$ErrorActionPreference = 'Stop'
$url = 'http://localhost:3000/'
$web = Join-Path $PSScriptRoot 'web'
$startupLock = New-Object System.Threading.Mutex($false, 'Local\BlackPlayground-3000')
$hasLock = $false

function Test-PlaygroundReady {
    try {
        $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
        if ($page.Content -notmatch '<title>Black Playground</title>') { return $false }

        $css = [regex]::Match($page.Content, 'href="(/_next/static/[^"?]+\.css(?:\?[^" ]*)?)"')
        if (-not $css.Success) { return $false }

        $style = [Uri]::new([Uri]$url, $css.Groups[1].Value)
        $response = Invoke-WebRequest -Uri $style -UseBasicParsing -Method Head -TimeoutSec 5
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

try {
    $chrome = @(
        (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(default)'
        (Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(default)'
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
    if (-not $chrome) { throw 'Google Chrome could not be found.' }

    try {
        $hasLock = $startupLock.WaitOne([TimeSpan]::FromSeconds(120))
    } catch [System.Threading.AbandonedMutexException] {
        $hasLock = $true
    }
    if (-not $hasLock) { throw 'Another launcher is still starting Black Playground.' }

    if (-not (Test-PlaygroundReady)) {
        if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
            throw 'Port 3000 is occupied and did not return a working Black Playground page.'
        }

        $node = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
        $next = 'node_modules/next/dist/bin/next'
        if (-not (Test-Path -LiteralPath (Join-Path $web $next))) {
            Write-Host 'Installing dependencies for the first launch...'
            Push-Location -LiteralPath $web
            try {
                & npm.cmd ci --no-audit --no-fund
                if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
            } finally {
                Pop-Location
            }
        }

        $log = Join-Path ([IO.Path]::GetTempPath()) "black-playground-$PID"
        Write-Host 'Starting Black Playground...'
        $server = Start-Process -FilePath $node -WorkingDirectory $web -WindowStyle Hidden -PassThru `
            -ArgumentList $next, 'dev', '--hostname', '127.0.0.1', '--port', '3000' `
            -RedirectStandardOutput "$log.out.log" -RedirectStandardError "$log.err.log"

        $ready = $false
        $deadline = [DateTime]::UtcNow.AddSeconds(120)
        do {
            if ($server.HasExited) { break }
            Start-Sleep -Milliseconds 700
            $ready = Test-PlaygroundReady
        } until ($ready -or [DateTime]::UtcNow -ge $deadline)

        if (-not $ready) { throw "Black Playground did not start. See $log.out.log and $log.err.log." }
    }

    Start-Process -FilePath $chrome -ArgumentList $url
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($hasLock) { $startupLock.ReleaseMutex() }
    $startupLock.Dispose()
}
