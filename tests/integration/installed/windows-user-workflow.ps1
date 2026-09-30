param(
    [switch]$DevChild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-ProjectDev {
    # docs:project-dev:start
    npm.cmd run dev -- --port 4173
    if ($LASTEXITCODE -ne 0) { throw 'The development server failed.' }
    # docs:project-dev:end
}

if ($DevChild) {
    Set-Location $env:CSO_WINDOWS_PROJECT
    Invoke-ProjectDev
    exit 0
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $absolutePath = [System.IO.Path]::GetFullPath($Path)
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($absolutePath, $Text.Replace("`r`n", "`n"), $utf8)
}

function Write-JsonNoBom([string]$Path, [object]$Value) {
    $json = ($Value | ConvertTo-Json -Depth 30).Replace("`r`n", "`n") + "`n"
    Write-Utf8NoBom $Path $json
}

function Wait-ForFile([string]$Path, [System.Diagnostics.Process]$Process, [int]$Seconds = 120) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath $Path) { return }
        if ($Process.HasExited) {
            throw "Process $($Process.Id) exited before writing $Path."
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Timed out waiting for $Path."
}

function Wait-ForOrigin([string]$Log, [System.Diagnostics.Process]$Process, [int]$Seconds = 90) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath $Log) {
            $match = [regex]::Match([System.IO.File]::ReadAllText($Log), 'CSO dev (http://127\.0\.0\.1:\d+)')
            if ($match.Success) { return $match.Groups[1].Value }
        }
        if ($Process.HasExited) {
            throw "Development server process $($Process.Id) exited before listening."
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'Development server did not start.'
}

function Test-PortOpen([uri]$Origin) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync($Origin.Host, $Origin.Port)
        return $connection.Wait(500) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Wait-ForPortRelease([uri]$Origin, [int]$Seconds = 30) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Test-PortOpen $Origin)) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "Port $($Origin.Port) remained open after process-tree termination."
}

function Stop-OwnedProcessTree([System.Diagnostics.Process]$Process) {
    if ($Process.HasExited) { return }
    taskkill.exe /PID $Process.Id /T /F | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "taskkill failed for process $($Process.Id)." }
    if (-not $Process.WaitForExit(15000)) {
        throw "Process tree $($Process.Id) did not exit after taskkill."
    }
}

function Get-HashRecord([string]$Path) {
    $item = Get-Item -LiteralPath $Path
    [ordered]@{
        path = $item.FullName
        bytes = $item.Length
        sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

function Get-BindingManifest([string]$BindingRoot) {
    @(
        Get-ChildItem -LiteralPath $BindingRoot -File -Recurse |
            Sort-Object FullName |
            ForEach-Object {
                $relativePath = $_.FullName.Substring($BindingRoot.Length + 1).Replace('\', '/')
                [ordered]@{
                    path = $relativePath
                    bytes = $_.Length
                    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                }
            }
    )
}

function Start-DevProcess([string]$Name, [string]$Project, [string]$EvidenceRoot) {
    $env:CSO_WINDOWS_PROJECT = $Project
    $hostExecutable = (Get-Process -Id $PID).Path
    $arguments = @('-NoProfile')
    if ($PSVersionTable.PSEdition -eq 'Desktop') {
        $arguments += @('-ExecutionPolicy', 'Bypass')
    }
    $arguments += @('-File', $PSCommandPath, '-DevChild')
    Start-Process -FilePath $hostExecutable -ArgumentList $arguments -WorkingDirectory $Project -PassThru -NoNewWindow `
        -RedirectStandardOutput (Join-Path $EvidenceRoot "$Name.stdout.log") `
        -RedirectStandardError (Join-Path $EvidenceRoot "$Name.stderr.log")
}

$repository = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$windowsShellId = $env:CSO_WINDOWS_SHELL_ID
if ($windowsShellId -notin @('powershell-5.1', 'pwsh-7')) {
    throw "Unknown Windows shell case: $windowsShellId"
}
$evidenceRoot = Join-Path $env:RUNNER_TEMP "cso installed packages $windowsShellId é"
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$transcriptPath = Join-Path $evidenceRoot 'workflow.log'
Start-Transcript -LiteralPath $transcriptPath | Out-Null

$commands = [System.Collections.Generic.List[object]]::new()
$activeBlock = 'version-assertions'
$registryProcess = $null
$devProcess = $null
$registryOrigin = $null
$firstOrigin = $null
$qualificationWritten = $false

try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'The maintained Windows workflow requires Windows.'
    }
    if ($PSVersionTable.PSEdition -ne $env:CSO_WINDOWS_EXPECTED_EDITION) {
        throw "Expected PowerShell edition $env:CSO_WINDOWS_EXPECTED_EDITION, received $($PSVersionTable.PSEdition)."
    }
    if ($PSVersionTable.PSVersion.Major -ne [int]$env:CSO_WINDOWS_EXPECTED_MAJOR) {
        throw "Expected PowerShell major $env:CSO_WINDOWS_EXPECTED_MAJOR, received $($PSVersionTable.PSVersion.Major)."
    }
    $nodeVersion = (node.exe --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') {
        throw "Expected Node 24, received $nodeVersion."
    }
    $npmVersion = (npm.cmd --version).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'npm version detection failed.' }
    $rootPython = Get-Command python -CommandType Application | Select-Object -First 1 -ExpandProperty Source
    if (-not $rootPython -or -not (Test-Path -LiteralPath $rootPython -PathType Leaf)) {
        throw 'Python did not resolve to an executable file.'
    }
    $pythonVersion = (& $rootPython --version 2>&1).ToString().Trim()
    if ($LASTEXITCODE -ne 0 -or $pythonVersion -notmatch '^Python 3\.11\.') {
        throw "Expected Python 3.11, received $pythonVersion."
    }
    $operatingSystem = Get-CimInstance Win32_OperatingSystem
    $versions = [ordered]@{
        os = [ordered]@{
            caption = $operatingSystem.Caption
            version = $operatingSystem.Version
            build = $operatingSystem.BuildNumber
        }
        powershell = [ordered]@{
            edition = $PSVersionTable.PSEdition
            version = $PSVersionTable.PSVersion.ToString()
        }
        node = $nodeVersion
        npm = $npmVersion
        python = $pythonVersion
    }
    Write-JsonNoBom (Join-Path $evidenceRoot 'versions.json') $versions

    Set-Location $repository
    $activeBlock = 'repository-setup'
    # docs:repository-setup:start
    $env:PYTHON = Get-Command python -CommandType Application | Select-Object -First 1 -ExpandProperty Source
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & $env:PYTHON -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed.' }
    $env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
    & $env:PYTHON -m pip wheel --no-deps ./packages/cso-python --wheel-dir artifacts
    if ($LASTEXITCODE -ne 0) { throw 'Python wheel build failed.' }
    & $env:PYTHON -m pip install --no-index --find-links artifacts --force-reinstall cs-object
    if ($LASTEXITCODE -ne 0) { throw 'Python wheel installation failed.' }
    npm.cmd run build:cli
    if ($LASTEXITCODE -ne 0) { throw 'CLI build failed.' }
    & $env:PYTHON -I -X utf8 -m cso_python bindings examples/two-panel
    if ($LASTEXITCODE -ne 0) { throw 'Two-panel binding generation failed.' }
    & $env:PYTHON -I -X utf8 -m cso_python bindings examples/section-properties
    if ($LASTEXITCODE -ne 0) { throw 'Section binding generation failed.' }
    npx.cmd playwright install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Chromium installation failed.' }
    # docs:repository-setup:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $activeBlock = 'focused-windows-regressions'
    & $env:PYTHON -I packages/cso-python/tests/test_bindings.py -v
    if ($LASTEXITCODE -ne 0) { throw 'Binding byte regressions failed.' }
    & node.exe node_modules/vitest/vitest.mjs run tests/integration/demo-launch.test.ts
    if ($LASTEXITCODE -ne 0) { throw 'npm launch regressions failed.' }
    & node.exe node_modules/vitest/vitest.mjs run tests/integration/cli-python-utf8.test.ts
    if ($LASTEXITCODE -ne 0) { throw 'CLI UTF-8 regressions failed.' }
    npm.cmd run test --workspace '@cs-object/cli' -- assets.test.ts
    if ($LASTEXITCODE -ne 0) { throw 'Native asset containment regressions failed.' }
    $env:CSO_EXAMPLES_DIRECTORY = Join-Path $repository 'tests\integration\fixtures\demo-preservation'
    npm.cmd run build:demo -- --help
    if ($LASTEXITCODE -ne 0) { throw 'The real npm demo launch failed.' }
    Remove-Item Env:CSO_EXAMPLES_DIRECTORY
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $canonicalReference = Join-Path $repository 'examples\two-panel\reference.json'
    $canonicalReferenceBefore = Get-HashRecord $canonicalReference
    $artifacts = Join-Path $repository 'artifacts'

    $activeBlock = 'archive-consumer'
    # docs:archive-consumer:start
    $artifacts = Join-Path $PWD 'artifacts'
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = $utf8
    $packedText = npm.cmd pack --workspace '@cs-object/core' --workspace '@cs-object/react' --workspace '@cs-object/cli' --pack-destination $artifacts --ignore-scripts --json
    if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed.' }
    $packed = ($packedText -join "`n") | ConvertFrom-Json
    $archives = @($packed | ForEach-Object { Join-Path $artifacts $_.filename })
    $consumer = Join-Path ([System.IO.Path]::GetTempPath()) ('cso-consumer-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory $consumer | Out-Null
    Push-Location $consumer
    try {
        npm.cmd init -y
        if ($LASTEXITCODE -ne 0) { throw 'Consumer initialization failed.' }
        npm.cmd install -- $archives
        if ($LASTEXITCODE -ne 0) { throw 'Archive installation failed.' }
        & $env:PYTHON -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Consumer Python environment creation failed.' }
        $env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
        & $env:PYTHON -m pip install --no-index --find-links $artifacts cs-object
        if ($LASTEXITCODE -ne 0) { throw 'Consumer wheel installation failed.' }
        & (Join-Path $PWD 'node_modules\.bin\cso.cmd') --help
        if ($LASTEXITCODE -ne 0) { throw 'Installed CLI launch failed.' }
    } finally {
        Pop-Location
    }
    # docs:archive-consumer:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    Set-Location $repository
    $activeBlock = 'canonical-report'
    # docs:canonical-report:start
    $env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
    $cso = Join-Path $PWD 'node_modules\.bin\cso.cmd'
    $source = Join-Path $PWD 'examples\two-panel\estimate.cso.py'
    $reference = Join-Path $PWD 'examples\two-panel\reference.json'
    & $cso bindings (Join-Path $PWD 'examples\two-panel')
    if ($LASTEXITCODE -ne 0) { throw 'Binding generation failed.' }
    & $cso verify $source --function estimate --input width=2 --reference $reference --format json
    if ($LASTEXITCODE -ne 0) { throw 'Calculation verification failed.' }
    New-Item -ItemType Directory -Force (Join-Path $PWD 'output') | Out-Null
    & $cso html $source --function estimate --input width=2 --reference $reference --out (Join-Path $PWD 'output\panels.html') --check-layout --format json
    if ($LASTEXITCODE -ne 0) { throw 'Checked HTML generation failed.' }
    & $cso pdf $source --function estimate --input width=2 --reference $reference --out (Join-Path $PWD 'output\panels.pdf') --format json
    if ($LASTEXITCODE -ne 0) { throw 'PDF generation failed.' }
    # docs:canonical-report:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $canonicalReferenceAfter = Get-HashRecord $canonicalReference
    if ($canonicalReferenceBefore.sha256 -ne $canonicalReferenceAfter.sha256) {
        throw 'Canonical reference bytes changed during the Windows workflow.'
    }

    $activeBlock = 'pack-initializer'
    npm.cmd run build --workspace create-cs-object
    if ($LASTEXITCODE -ne 0) { throw 'Initializer build failed.' }
    $initializerText = npm.cmd pack --workspace create-cs-object --ignore-scripts --pack-destination $artifacts --json
    if ($LASTEXITCODE -ne 0) { throw 'Initializer archive creation failed.' }
    $initializerPack = @(($initializerText -join "`n") | ConvertFrom-Json)
    if ($initializerPack.Count -ne 1) { throw 'Expected one initializer archive.' }
    $initializerArchive = Join-Path $artifacts $initializerPack[0].filename
    $initializerFiles = @(tar.exe -tzf $initializerArchive)
    if ($LASTEXITCODE -ne 0) { throw 'Initializer archive inspection failed.' }
    if ($initializerFiles -notcontains 'package/dist/cli.js') {
        throw 'Initializer archive omitted dist/cli.js.'
    }
    if ($initializerFiles -notcontains 'package/template/.gitattributes') {
        throw 'Initializer archive omitted template/.gitattributes.'
    }
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $registryReady = Join-Path $evidenceRoot 'registry-ready.json'
    $registryStop = Join-Path $evidenceRoot 'registry-stop'
    $registryConfig = Join-Path $evidenceRoot 'registry-config.json'
    Write-JsonNoBom $registryConfig ([ordered]@{
        archives = $artifacts
        readyPath = $registryReady
        stopPath = $registryStop
        evidenceRoot = $evidenceRoot
    })
    $env:CSO_WINDOWS_CONFIG = $registryConfig
    $node = Get-Command node -CommandType Application | Select-Object -First 1 -ExpandProperty Source
    if (-not $node -or -not (Test-Path -LiteralPath $node -PathType Leaf)) {
        throw 'Node did not resolve to an executable file.'
    }
    $tsx = Join-Path $repository 'node_modules\tsx\dist\cli.mjs'
    $registryScript = Join-Path $repository 'tests\integration\installed\windows-registry.ts'
    $registryProcess = Start-Process -FilePath $node -ArgumentList @($tsx, $registryScript) -WorkingDirectory $repository -PassThru -NoNewWindow `
        -RedirectStandardOutput (Join-Path $evidenceRoot 'registry.stdout.log') `
        -RedirectStandardError (Join-Path $evidenceRoot 'registry.stderr.log')
    Wait-ForFile $registryReady $registryProcess
    $registrySession = [System.IO.File]::ReadAllText($registryReady, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $registryOrigin = [uri]$registrySession.origin

    foreach ($name in @('NODE_PATH', 'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV')) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    $env:npm_config_registry = $registryOrigin.AbsoluteUri.TrimEnd('/')
    $env:npm_config_yes = 'true'
    $env:npm_config_audit = 'false'
    $env:npm_config_fund = 'false'
    $env:npm_config_update_notifier = 'false'
    $env:npm_config_fetch_retries = '1'
    $env:npm_config_fetch_timeout = '30000'
    $env:npm_config_cache = Join-Path $evidenceRoot 'npm-cache'
    $env:PIP_FIND_LINKS = $artifacts
    $env:PIP_NO_INDEX = '1'
    $env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
    $env:PYTHON = $rootPython

    Set-Location $evidenceRoot
    $activeBlock = 'project-create'
    # docs:project-create:start
    npm.cmd create cs-object my-report -- --skip-install
    if ($LASTEXITCODE -ne 0) { throw 'Project creation failed.' }
    Set-Location my-report
    # docs:project-create:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })
    $project = $PWD.Path
    if (-not $project.Contains(' ') -or -not $project.Contains('é')) {
        throw "The installed project path did not retain spaces and Unicode: $project"
    }
    $templateAttributes = Join-Path $repository 'packages\create-cs-object\template\.gitattributes'
    $projectAttributes = Join-Path $project '.gitattributes'
    if (-not (Test-Path -LiteralPath $projectAttributes)) {
        throw 'Generated project omitted .gitattributes.'
    }
    if ((Get-HashRecord $templateAttributes).sha256 -ne (Get-HashRecord $projectAttributes).sha256) {
        throw 'Generated .gitattributes bytes differ from the initializer template.'
    }

    $activeBlock = 'project-setup'
    # docs:project-setup:start
    npm.cmd run setup
    if ($LASTEXITCODE -ne 0) { throw 'Project setup failed.' }
    # docs:project-setup:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $activeBlock = 'project-build'
    # docs:project-build:start
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'The frontend build failed.' }
    # docs:project-build:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
    $isolationProbe = Join-Path $evidenceRoot 'python-location.py'
    Write-Utf8NoBom $isolationProbe "import cso_python`nprint(cso_python.__file__)`n"
    $pythonLocation = (& $env:PYTHON -I -X utf8 $isolationProbe).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Installed Python isolation probe failed.' }
    if (-not [System.IO.Path]::GetFullPath($pythonLocation).StartsWith(
        [System.IO.Path]::GetFullPath((Join-Path $project '.venv')),
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Installed Python module resolved outside the project: $pythonLocation"
    }

    $activeBlock = 'reference-authoring'
    # docs:reference-authoring:start
    $env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
    $cso = Join-Path $PWD 'node_modules\.bin\cso.cmd'
    $source = Join-Path $PWD 'calculations\report.cso.py'
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = $utf8
    $reportText = & $cso verify $source --function calculate --input width=2 --input height=3 --format json
    if ($LASTEXITCODE -ne 0) { throw 'Calculation verification failed.' }
    $report = ($reportText -join "`n") | ConvertFrom-Json
    if (-not $report.ok) { throw 'Resolve verification diagnostics before binding a case.' }
    $binding = [ordered]@{}
    foreach ($name in @('entryModuleId', 'entrySourceHash', 'sourceClosureHash', 'function', 'resolvedInputs', 'resolvedInputKinds')) {
        $binding[$name] = $report.provenance.$name
    }
    $reference = [ordered]@{
        referenceVersion = '1'
        cases = @([ordered]@{
            id = 'rectangle-2-by-3'
            revision = '1'
            basis = [ordered]@{
                method = 'Hand-derived rectangle area'
                derivation = 'Perpendicular sides: 2 m times 3 m equals 6 m^2.'
                sourceDescription = 'Elementary geometry for the stated rectangle.'
            }
            binding = $binding
            expected = @([ordered]@{
                symbolId = '["symbol","root","area"]'
                value = 6
                unit = 'm^2'
            })
        })
    }
    $referencePath = Join-Path $PWD 'references\rectangle-reference.json'
    $json = ($reference | ConvertTo-Json -Depth 20).Replace("`r`n", "`n") + "`n"
    [System.IO.File]::WriteAllText($referencePath, $json, $utf8)
    & $cso verify $source --function calculate --input width=2 --input height=3 --reference $referencePath --format json
    if ($LASTEXITCODE -ne 0) { throw 'Independent reference verification failed.' }
    # docs:reference-authoring:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $expectedInterpreter = [System.IO.Path]::GetFullPath($env:PYTHON)
    $reportedInterpreter = [System.IO.Path]::GetFullPath([string]$report.provenance.versions.pythonInterpreter)
    if (-not $expectedInterpreter.Equals($reportedInterpreter, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Python interpreter provenance changed: $reportedInterpreter"
    }
    $referenceReportText = & $cso verify $source --function calculate --input width=2 --input height=3 --reference $referencePath --format json
    if ($LASTEXITCODE -ne 0) { throw 'Independent reference receipt failed.' }
    $referenceReport = ($referenceReportText -join "`n") | ConvertFrom-Json
    if ($referenceReport.checks.independentReferenceAgreement.status -ne 'passed') {
        throw 'The authored rectangle reference did not establish independent agreement.'
    }
    Write-Utf8NoBom (Join-Path $evidenceRoot 'reference-verification.json') (($referenceReportText -join "`n") + "`n")

    $calculations = Join-Path $project 'calculations'
    Copy-Item -LiteralPath (Join-Path $repository 'examples\two-panel\material.cso.py') -Destination $calculations
    Copy-Item -LiteralPath (Join-Path $repository 'examples\two-panel\geometry.cso.py') -Destination $calculations
    Copy-Item -LiteralPath (Join-Path $repository 'examples\two-panel\estimate.cso.py') -Destination $calculations
    Copy-Item -LiteralPath (Join-Path $repository 'examples\two-panel\quantities.py') -Destination $calculations
    Copy-Item -LiteralPath (Join-Path $repository 'examples\two-panel\panels.svg') -Destination $calculations
    Copy-Item -LiteralPath $canonicalReference -Destination $calculations
    $copiedReference = Join-Path $calculations 'reference.json'
    if ((Get-HashRecord $copiedReference).sha256 -ne $canonicalReferenceBefore.sha256) {
        throw 'The copied canonical reference bytes changed.'
    }
    $unicodeSource = [System.IO.File]::ReadAllText((Join-Path $calculations 'report.cso.py'))
    Write-Utf8NoBom (Join-Path $calculations 'unicode.cso.py') $unicodeSource.Replace('def calculate(', 'def calculer_é(')

    $reportsPath = Join-Path $project 'reports.json'
    $reports = @(([System.IO.File]::ReadAllText($reportsPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json))
    $reports[0] | Add-Member -NotePropertyName reference -NotePropertyValue 'references/rectangle-reference.json'
    $reports += [pscustomobject][ordered]@{
        id = 'two-panel'
        title = 'Two-panel estimate'
        source = 'calculations/estimate.cso.py'
        function = 'estimate'
        reference = 'calculations/reference.json'
    }
    $reports += [pscustomobject][ordered]@{
        id = 'unicode-entry'
        title = 'Unicode entry function'
        source = 'calculations/unicode.cso.py'
        function = 'calculer_é'
    }
    Write-JsonNoBom $reportsPath $reports

    $activeBlock = 'project-bindings'
    # docs:project-bindings:start
    $env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
    & $env:PYTHON -I -X utf8 -m cso_python bindings calculations
    if ($LASTEXITCODE -ne 0) { throw 'Binding generation failed.' }
    & $env:PYTHON -I -X utf8 -m cso_python bindings calculations --check
    if ($LASTEXITCODE -ne 0) { throw 'Bindings are stale.' }
    # docs:project-bindings:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $bindingRoot = Join-Path $calculations '_cso_bindings'
    $bindingManifest = Get-BindingManifest $bindingRoot
    if ($bindingManifest.Count -eq 0 -or -not @($bindingManifest.path).Where({ $_.EndsWith('.pyi') })) {
        throw 'Binding evidence must include generated runtime and stub files.'
    }

    $activeBlock = 'project-report'
    # docs:project-report:start
    $env:PYTHON = Join-Path $PWD '.venv\Scripts\python.exe'
    $cso = Join-Path $PWD 'node_modules\.bin\cso.cmd'
    $source = Join-Path $PWD 'calculations\report.cso.py'
    & $cso verify $source --function calculate --input width=2 --input height=3 --format json
    if ($LASTEXITCODE -ne 0) { throw 'Calculation verification failed.' }
    New-Item -ItemType Directory -Force (Join-Path $PWD 'output') | Out-Null
    & $cso html $source --function calculate --input width=2 --input height=3 --out (Join-Path $PWD 'output\report.html') --check-layout --format json
    if ($LASTEXITCODE -ne 0) { throw 'Checked HTML generation failed.' }
    & $cso pdf $source --function calculate --input width=2 --input height=3 --out (Join-Path $PWD 'output\report.pdf') --format json
    if ($LASTEXITCODE -ne 0) { throw 'PDF generation failed.' }
    # docs:project-report:end
    $commands.Add([ordered]@{ name = $activeBlock; status = 0 })

    $env:CSO_WINDOWS_PROJECT = $project
    $devProcess = Start-DevProcess 'dev-first' $project $evidenceRoot
    $firstOrigin = [uri](Wait-ForOrigin (Join-Path $evidenceRoot 'dev-first.stdout.log') $devProcess)
    if ($firstOrigin.Port -ne 4173) { throw "Development server used unexpected port $($firstOrigin.Port)." }
    $verifyConfig = Join-Path $evidenceRoot 'verify-exercise-config.json'
    Write-JsonNoBom $verifyConfig ([ordered]@{
        kind = 'exercise'
        origin = $firstOrigin.AbsoluteUri
        project = $project
        evidenceRoot = $evidenceRoot
        registryOrigin = $registryOrigin.AbsoluteUri
        pythonLocation = [System.IO.Path]::GetFullPath($pythonLocation)
        referencePath = $copiedReference
    })
    $env:CSO_WINDOWS_VERIFY_CONFIG = $verifyConfig
    & $node $tsx (Join-Path $repository 'tests\integration\installed\windows-verify.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Windows browser and API verification failed.' }
    $exercisePath = Join-Path $evidenceRoot 'exercise.json'
    $exercise = [System.IO.File]::ReadAllText($exercisePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

    Stop-OwnedProcessTree $devProcess
    $devProcess = $null
    Wait-ForPortRelease $firstOrigin

    $devProcess = Start-DevProcess 'dev-restart' $project $evidenceRoot
    $restartOrigin = [uri](Wait-ForOrigin (Join-Path $evidenceRoot 'dev-restart.stdout.log') $devProcess)
    if ($restartOrigin.Port -ne $firstOrigin.Port) { throw 'Development server did not restart on the same port.' }
    $restartConfig = Join-Path $evidenceRoot 'verify-restart-config.json'
    Write-JsonNoBom $restartConfig ([ordered]@{
        kind = 'restart'
        origin = $restartOrigin.AbsoluteUri
        project = $project
        evidenceRoot = $evidenceRoot
        expiredRunPath = $exercise.expiredRunPath
    })
    $env:CSO_WINDOWS_VERIFY_CONFIG = $restartConfig
    & $node $tsx (Join-Path $repository 'tests\integration\installed\windows-verify.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Windows restart verification failed.' }
    Stop-OwnedProcessTree $devProcess
    $devProcess = $null
    Wait-ForPortRelease $restartOrigin

    Write-Utf8NoBom $registryStop "stop`n"
    if (-not $registryProcess.WaitForExit(15000)) {
        throw 'The local registry did not stop after its owned stop request.'
    }
    $registryProcess = $null
    Wait-ForPortRelease $registryOrigin

    $archiveEvidence = @(
        Get-ChildItem -LiteralPath $artifacts -File |
            Where-Object { $_.Extension -in @('.tgz', '.whl') } |
            Sort-Object Name |
            ForEach-Object { Get-HashRecord $_.FullName }
    )
    $qualification = [ordered]@{
        ok = $true
        shell = $windowsShellId
        root = $evidenceRoot
        project = $project
        versions = $versions
        commands = $commands
        archives = $archiveEvidence
        initializer = [ordered]@{
            archive = (Get-HashRecord $initializerArchive)
            gitattributes = (Get-HashRecord $projectAttributes)
        }
        pythonLocation = [System.IO.Path]::GetFullPath($pythonLocation)
        bindings = $bindingManifest
        canonicalReference = [ordered]@{
            repositoryBefore = $canonicalReferenceBefore
            repositoryAfter = $canonicalReferenceAfter
            copied = Get-HashRecord $copiedReference
        }
        authoredReference = [ordered]@{
            file = Get-HashRecord $referencePath
            agreement = $referenceReport.checks.independentReferenceAgreement.status
            pythonInterpreter = $reportedInterpreter
        }
        commandArtifacts = [ordered]@{
            repositoryHtml = (Get-HashRecord (Join-Path $repository 'output\panels.html'))
            repositoryPdf = (Get-HashRecord (Join-Path $repository 'output\panels.pdf'))
            projectHtml = (Get-HashRecord (Join-Path $project 'output\report.html'))
            projectPdf = (Get-HashRecord (Join-Path $project 'output\report.pdf'))
        }
        lifecycle = [ordered]@{
            firstOrigin = $firstOrigin.AbsoluteUri
            restartedOrigin = $restartOrigin.AbsoluteUri
            samePort = $true
            expiredRunStatus = 404
            releasedAfterEachStop = $true
            termination = 'owned process tree terminated by taskkill /T /F'
            foregroundWindows11CtrlC = 'pending; hosted automation does not reproduce a foreground desktop Ctrl+C event'
        }
        browserAndApi = $exercise
        visualInspection = 'pending; automated layout, HTML, PDF, and download checks do not establish human visual inspection'
    }
    Write-JsonNoBom (Join-Path $evidenceRoot 'qualification.json') $qualification
    $qualificationWritten = $true
    Write-Host "PASS maintained Windows installed-user workflow. Evidence: $(Join-Path $evidenceRoot 'qualification.json')"
} catch {
    $failure = [ordered]@{
        ok = $false
        shell = $windowsShellId
        activeBlock = $activeBlock
        lastExitCode = $LASTEXITCODE
        commands = $commands
        message = $_.Exception.Message
        scriptStackTrace = $_.ScriptStackTrace
    }
    Write-JsonNoBom (Join-Path $evidenceRoot 'failure.json') $failure
    throw
} finally {
    if ($devProcess -and -not $devProcess.HasExited) {
        try { Stop-OwnedProcessTree $devProcess } catch { Write-Warning $_.Exception.Message }
    }
    if ($registryProcess -and -not $registryProcess.HasExited) {
        try {
            if ($registryOrigin) { Write-Utf8NoBom $registryStop "stop`n" }
            if (-not $registryProcess.WaitForExit(5000)) { Stop-OwnedProcessTree $registryProcess }
        } catch { Write-Warning $_.Exception.Message }
    }
    if (-not $qualificationWritten) {
        Write-Host "Windows evidence retained at $evidenceRoot"
    }
    Stop-Transcript | Out-Null
}
