# Renders every page of a PDF and runs OCR on it using Windows' built-in
# recognizer (Windows.Data.Pdf + Windows.Media.Ocr, WinRT) — no external
# dependency, no model download, no cloud call. Prints the recognized text
# for all pages, separated by a page-break marker, to stdout as UTF-8.
#
# Used by lib/pdf-parser.ts as a fallback when a PDF has no extractable text
# layer (a scan). Requires the target OCR language pack to be installed
# (Settings -> Time & Language -> Language & region -> "Русский" with
# "Optical character recognition" checked); if it isn't, this exits with an
# error and the caller falls back to whatever it already had.
param(
    [Parameter(Mandatory = $true)][string]$PdfPath,
    [string]$Language = "ru"
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetGenericArguments().Count -eq 1
})[0]
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and -not $_.IsGenericMethod
})[0]
function AwaitOperation($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}
function AwaitAction($WinRtAction) {
    $netTask = $asTaskAction.Invoke($null, @($WinRtAction))
    $netTask.Wait(-1) | Out-Null
}

[Windows.Data.Pdf.PdfDocument,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Globalization.Language,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null

$lang = [Windows.Globalization.Language]::new($Language)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if (-not $engine) {
    Write-Error "OCR language '$Language' is not installed on this machine."
    exit 1
}

$file = AwaitOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($PdfPath)) ([Windows.Storage.StorageFile])
$pdfDoc = AwaitOperation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])

$allText = @()
for ($i = 0; $i -lt $pdfDoc.PageCount; $i++) {
    $page = $pdfDoc.GetPage([uint32]$i)
    try {
        $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
        $renderOptions = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
        # 2x native resolution — meaningfully improves OCR accuracy over the PDF's default 72dpi render.
        $renderOptions.DestinationWidth = [uint32]($page.Size.Width * 2)
        $renderOptions.DestinationHeight = [uint32]($page.Size.Height * 2)
        AwaitAction ($page.RenderToStreamAsync($stream, $renderOptions))

        $decoder = AwaitOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = AwaitOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $ocrResult = AwaitOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

        # OcrResult.Text concatenates lines in the engine's internal region
        # order, which for a 2-column label/value table (my.gov.uz's PDF
        # layout) comes out as "all labels, then all values" — useless for
        # extractFieldsFromText's label-then-value regexes. Each label and
        # its value share nearly the same Y position (same table row), so
        # sorting lines by (Y, then X) reconstructs true left-to-right,
        # top-to-bottom reading order instead.
        # ponytail: this is a page-global sort, not per-row clustering — it
        # correctly pairs single-line label/value rows (which covers the
        # application number, status, current action, and verification
        # password — everything actually required to check status on
        # my.gov.uz) but can misorder rows where the label or value itself
        # wraps onto multiple lines (e.g. "last changed date"'s two-line
        # label). Upgrade path if that's ever needed: proper row-clustering
        # using each line's bounding-box height, not just its Y position.
        $linesWithPos = foreach ($line in $ocrResult.Lines) {
            $words = @($line.Words)
            if ($words.Count -eq 0) { continue }
            $rect = $words[0].BoundingRect
            [PSCustomObject]@{ Y = [double]$rect.Y; X = [double]$rect.X; Text = $line.Text }
        }
        $sorted = $linesWithPos | Sort-Object -Property Y, X
        $allText += ($sorted | ForEach-Object { $_.Text }) -join "`n"
    } finally {
        $page.Dispose()
    }
}

Write-Output ($allText -join "`n---PAGE BREAK---`n")
