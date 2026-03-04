param(
    [string]$InputXlsm = "C:\Users\praja\OneDrive\Desktop\cards project\Data for LMU analyses 13 aug 2025.xlsm",
    [string]$SheetName = "T1 final trials",
    [string]$OutputJson = "public/data/card_analysis_data.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-TokenParts {
    param([string]$Token)
    if ([string]::IsNullOrWhiteSpace($Token)) { return $null }
    $t = $Token.Trim()
    if ($t -eq "null") { return $null }
    if ($t -match "Off Grid") { return $null }

    # Examples: queen_spades_cA1, blank4_cA4, jack_clubs_gD3
    $m = [regex]::Match($t, "^(?<name>[A-Za-z0-9]+)_(?<suit>[A-Za-z0-9]+)_(?<cond>[A-Za-z])(?<row>[A-H])(?<col>[1-8])$")
    if (-not $m.Success) { return $null }

    $name = $m.Groups["name"].Value.ToLowerInvariant()
    $suitName = $m.Groups["suit"].Value.ToLowerInvariant()
    $rowLetter = $m.Groups["row"].Value.ToUpperInvariant()
    $colNum = [int]$m.Groups["col"].Value

    $value = switch -Regex ($name) {
        "^king" { "K"; break }
        "^queen" { "Q"; break }
        "^jack" { "J"; break }
        "^blank" { "BLANK"; break }
        default { "" }
    }
    if ($value -eq "") { return $null }

    $isBlank = $value -eq "BLANK"
    $suitSymbol = switch ($suitName) {
        "spades" { "♠" }
        "hearts" { "♥" }
        "diamonds" { "♦" }
        "clubs" { "♣" }
        default { "□" }
    }
    $color = if ($isBlank) { "#9e9e9e" } elseif ($suitName -in @("hearts", "diamonds")) { "red" } else { "black" }

    return [pscustomobject]@{
        row         = [int]([byte][char]$rowLetter - [byte][char]'A')
        col         = [int]($colNum - 1)
        value       = $value
        suit_symbol = $suitSymbol
        color       = $color
        is_blank    = $isBlank
    }
}

function Parse-TokenList {
    param([object]$CellValue)
    if ($null -eq $CellValue) { return @() }
    $s = [string]$CellValue
    if ([string]::IsNullOrWhiteSpace($s)) { return @() }
    $trimmed = $s.Trim()
    if ($trimmed -eq "0") { return @() }

    $body = $trimmed.TrimStart("[").TrimEnd("]")
    if ([string]::IsNullOrWhiteSpace($body)) { return @() }

    $rawParts = $body -split ","
    $tokens = @()
    foreach ($p in $rawParts) {
        $tok = $p.Trim().Trim("'").Trim('"')
        if ([string]::IsNullOrWhiteSpace($tok)) { continue }
        if ($tok -eq "null") { continue }
        $tokens += $tok
    }
    return $tokens
}

function Get-MessinessScore {
    param([array]$Moves)
    if ($Moves.Count -eq 0) { return 0.0 }
    $avgRow = ($Moves | Measure-Object -Property row -Average).Average
    $avgCol = ($Moves | Measure-Object -Property col -Average).Average
    $sum = 0.0
    foreach ($m in $Moves) {
        $dr = [double]$m.row - [double]$avgRow
        $dc = [double]$m.col - [double]$avgCol
        $sum += [Math]::Sqrt(($dr * $dr) + ($dc * $dc))
    }
    return $sum / [double]$Moves.Count
}

function As-IntSafe {
    param([object]$v)
    try { return [int]$v } catch { return 0 }
}

if (-not (Test-Path -LiteralPath $InputXlsm)) {
    throw "Input file not found: $InputXlsm"
}

$resolvedOutput = Resolve-Path -LiteralPath (Split-Path -Parent $OutputJson) -ErrorAction SilentlyContinue
if (-not $resolvedOutput) {
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $OutputJson) -Force
}

$tempPath = Join-Path (Get-Location) "tmp_lmu_import.xlsm"
try {
    Copy-Item -LiteralPath $InputXlsm -Destination $tempPath -Force
}
catch {
    if (-not (Test-Path -LiteralPath $tempPath)) {
        throw
    }
    Write-Warning "Could not copy source workbook (likely locked). Reusing existing temp copy: $tempPath"
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $wb = $excel.Workbooks.Open($tempPath)
    $ws = $wb.Worksheets.Item($SheetName)
    $used = $ws.UsedRange
    $rows = $used.Rows.Count
    $cols = $used.Columns.Count
    $data = $used.Value2

    $headerIndex = @{}
    for ($c = 1; $c -le $cols; $c++) {
        $h = [string]$data[1, $c]
        if (-not [string]::IsNullOrWhiteSpace($h)) {
            $headerIndex[$h] = $c
        }
    }

    foreach ($required in @("participant", "condition", "overall_correct", "trialN", "movement_codes", "final_card_position_codes_1")) {
        if (-not $headerIndex.ContainsKey($required)) {
            throw "Required column missing: $required"
        }
    }

    $moveCols = @()
    foreach ($kv in $headerIndex.GetEnumerator()) {
        if ($kv.Key -match "^move_(\d+)$") {
            $moveCols += [pscustomobject]@{ Name = $kv.Key; Idx = $kv.Value; N = [int]$Matches[1] }
        }
    }
    $moveCols = $moveCols | Sort-Object N

    $trials = @()
    for ($r = 2; $r -le $rows; $r++) {
        $participant = [string]$data[$r, $headerIndex["participant"]]
        if ([string]::IsNullOrWhiteSpace($participant)) { continue }

        $condition = [string]$data[$r, $headerIndex["condition"]]
        if ([string]::IsNullOrWhiteSpace($condition)) { continue }

        $overallRaw = [string]$data[$r, $headerIndex["overall_correct"]]
        $overallNum = As-IntSafe $overallRaw
        $outcome = if ($overallNum -eq 1) { "success" } else { "fail" }

        $trialN = As-IntSafe ([string]$data[$r, $headerIndex["trialN"]])

        # Primary move source: movement_codes (ordered list).
        # Fallback: move_n columns if movement_codes is empty/unusable.
        $moves = @()
        $movementCodesRaw = [string]$data[$r, $headerIndex["movement_codes"]]
        $movementTokens = Parse-TokenList -CellValue $movementCodesRaw
        foreach ($tok in $movementTokens) {
            $parts = Get-TokenParts -Token $tok
            if ($null -ne $parts) {
                $moves += $parts
            }
        }

        if ($moves.Count -eq 0) {
            foreach ($mc in $moveCols) {
                $tok = [string]$data[$r, $mc.Idx]
                if ([string]::IsNullOrWhiteSpace($tok)) { continue }
                $parts = Get-TokenParts -Token $tok
                if ($null -ne $parts) {
                    $moves += $parts
                }
            }
        }

        $finalCodesRaw = [string]$data[$r, $headerIndex["final_card_position_codes_1"]]
        $finalTokens = Parse-TokenList -CellValue $finalCodesRaw
        $finalState = @()
        foreach ($ft in $finalTokens) {
            $parts = Get-TokenParts -Token $ft
            if ($null -ne $parts) {
                $finalState += $parts
            }
        }

        if ($moves.Count -eq 0 -and $finalState.Count -eq 0) { continue }

        $messiness = Get-MessinessScore -Moves $moves
        $blankCount = @($finalState | Where-Object { $_.is_blank -eq $true }).Count

        $trial = [pscustomobject]@{
            participant      = $participant
            outcome          = $outcome
            moves            = $moves
            final_state      = $finalState
            move_count       = [int]$moves.Count
            messiness_score  = [double]$messiness
            condition        = $condition
            trial_number     = $trialN
            blank_card_count = [int]$blankCount
        }
        $trials += $trial
    }

    $total = $trials.Count
    $successCount = ($trials | Where-Object { $_.outcome -eq "success" }).Count
    $avgMoves = if ($total -gt 0) { ($trials | Measure-Object -Property move_count -Average).Average } else { 0.0 }
    $withBlank = @($trials | Where-Object { $_.blank_card_count -gt 0 })
    $withoutBlank = @($trials | Where-Object { $_.blank_card_count -eq 0 })
    $withBlankSuccess = @($withBlank | Where-Object { $_.outcome -eq "success" }).Count
    $withoutBlankSuccess = @($withoutBlank | Where-Object { $_.outcome -eq "success" }).Count

    $blankSuccessRate = if ($withBlank.Count -gt 0) { 100.0 * $withBlankSuccess / $withBlank.Count } else { 0.0 }
    $noBlankSuccessRate = if ($withoutBlank.Count -gt 0) { 100.0 * $withoutBlankSuccess / $withoutBlank.Count } else { 0.0 }

    $analysisTypes = @(
        [ordered]@{ id = 1; title = "Successful Clean Patterns (Many Moves)"; subtitle = "Pattern analysis"; explanation = "Derived from full workbook import."; trials = @() },
        [ordered]@{ id = 2; title = "Failed Messy Patterns (Few Moves)"; subtitle = "Pattern analysis"; explanation = "Derived from full workbook import."; trials = @() },
        [ordered]@{ id = 3; title = "All Successful Trials"; subtitle = "Pattern analysis"; explanation = "Derived from full workbook import."; trials = @() },
        [ordered]@{ id = 4; title = "In-Trial Progression (Early vs Late)"; subtitle = "Pattern analysis"; explanation = "Derived from full workbook import."; trials = @() },
        [ordered]@{ id = 5; title = "Opening Strategies (First 5 Moves)"; subtitle = "Pattern analysis"; explanation = "Derived from full workbook import."; trials = @() },
        [ordered]@{ id = 6; title = "Retry and Recovery Patterns"; subtitle = "Pattern analysis"; explanation = "All imported trials from workbook; repeated participant IDs represent retries."; trials = $trials },
        [ordered]@{ id = 7; title = "Extreme Cases (Cleanest vs Messiest)"; subtitle = "Pattern analysis"; explanation = "Derived from full workbook import."; trials = @() },
        [ordered]@{ id = 8; title = "Speed Comparison (Quick vs Slow Solvers)"; subtitle = "Pattern analysis"; explanation = "Derived from full workbook import."; trials = @() },
        [ordered]@{ id = 9; title = "Card Repetition Patterns"; subtitle = "Pattern analysis"; explanation = "Derived from full workbook import."; trials = @() }
    )

    $output = [ordered]@{
        statistics = [ordered]@{
            total_trials            = [int]$total
            success_count           = [int]$successCount
            success_rate            = if ($total -gt 0) { 100.0 * $successCount / $total } else { 0.0 }
            avg_moves               = [double]$avgMoves
            blank_card_success_rate = [double]$blankSuccessRate
            no_blank_success_rate   = [double]$noBlankSuccessRate
            trials_with_blank_cards = [int]$withBlank.Count
        }
        analysis_types = $analysisTypes
    }

    $jsonText = $output | ConvertTo-Json -Depth 12
    Set-Content -LiteralPath $OutputJson -Value $jsonText -Encoding UTF8

    $participantCounts = @{}
    foreach ($t in $trials) {
        $p = [string]$t.participant
        if ($participantCounts.ContainsKey($p)) { $participantCounts[$p] += 1 } else { $participantCounts[$p] = 1 }
    }
    $multi = @($participantCounts.GetEnumerator() | Where-Object { $_.Value -gt 1 } | Sort-Object Value -Descending)

    Write-Output "Wrote $OutputJson"
    Write-Output ("Imported trials: {0}, participants: {1}, participants with retries: {2}" -f $trials.Count, $participantCounts.Count, $multi.Count)
    Write-Output "Top repeated participants:"
    $multi | Select-Object -First 20 | ForEach-Object { Write-Output ("P{0}={1}" -f $_.Key, $_.Value) }

    $wb.Close($false)
}
finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    if (Test-Path -LiteralPath $tempPath) {
        Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
}
