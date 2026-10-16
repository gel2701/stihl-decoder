<#
.SYNOPSIS
Install 73 Agent Skills from itallstartedwithaidea/agent-skills for multiple AI agents.
.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/install-agent-skills.ps1 -Project
.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/install-agent-skills.ps1 -Global
.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/install-agent-skills.ps1 -Project -Global
#>
[CmdletBinding()]
param(
    [switch]$Project,
    [switch]$Global,
    [string]$Repository = 'https://github.com/itallstartedwithaidea/agent-skills.git'
)
$ErrorActionPreference = 'Stop'
if (-not $Project -and -not $Global) { $Project = $true }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required.' }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ('agent-skills-' + [guid]::NewGuid().ToString('N'))
try {
    & git clone --depth 1 -- $Repository $temp
    if ($LASTEXITCODE -ne 0) { throw 'Unable to clone Agent Skills.' }
    $skills = @(Get-ChildItem -LiteralPath (Join-Path $temp 'skills') -Filter 'SKILL.md' -File -Recurse)
    if ($skills.Count -ne 73) { Write-Warning "Expected 73 upstream skills; found $($skills.Count). Inspect source before continuing." }
    $bases = @()
    if ($Project) { $bases += $projectRoot }
    if ($Global) { $bases += $HOME }
    $runtimes = @('.agents/skills', '.claude/skills', '.cursor/skills', '.gemini/skills')
    foreach ($base in ($bases | Select-Object -Unique)) {
        foreach ($runtime in $runtimes) {
            $root = Join-Path $base $runtime
            New-Item -ItemType Directory -Path $root -Force | Out-Null
            foreach ($skill in $skills) {
                $name = $skill.Directory.Name
                $destination = Join-Path (Join-Path $root $name) 'SKILL.md'
                New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
                Copy-Item -LiteralPath $skill.FullName -Destination $destination -Force
            }
            Write-Host "Installed $($skills.Count) skills in $root"
        }
        $licenseTarget = Join-Path $base 'agent-skills-upstream-LICENSE'
        Copy-Item -LiteralPath (Join-Path $temp 'LICENSE') -Destination $licenseTarget -Force
    }
    Write-Host 'Done. Restart running agent sessions to refresh skill discovery.'
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
