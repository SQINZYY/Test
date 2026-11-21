# SetupBuilder - liest die Hardware dieses PCs aus und schickt die Bauteil-Namen an die App auf deinem Handy.
# Gesendet werden nur Hardware-Namen (CPU, Mainboard, RAM, Grafikkarte, Laufwerke, Monitore, USB-/Bluetooth-Geraete),
# keine Dateien und keine persoenlichen Daten - und nur an dein Handy im selben WLAN.
# Laeuft mit Windows PowerShell 5.1 (Windows 10/11) und PowerShell 7.
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$upload = '{{UPLOAD}}'

Write-Host ''
Write-Host 'SetupBuilder: Hardware wird ausgelesen ...' -ForegroundColor Cyan

function Dec($codes) {
  if (-not $codes) { return '' }
  return (($codes | Where-Object { $_ -ne 0 }) | ForEach-Object { [char]$_ }) -join ''
}

$r = [ordered]@{ v = 1 }

$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$r.cpu = [ordered]@{ name = "$($cpu.Name)".Trim(); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors }

$bb = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$r.mb = [ordered]@{ maker = "$($bb.Manufacturer)".Trim(); product = "$($bb.Product)".Trim() }

$r.ram = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  [ordered]@{ size = [math]::Round($_.Capacity / 1GB); speed = $_.ConfiguredClockSpeed; maxSpeed = $_.Speed
    type = $_.SMBIOSMemoryType; part = "$($_.PartNumber)".Trim(); maker = "$($_.Manufacturer)".Trim() }
})

# Grafikkarten: Speichergroesse steht korrekt nur in der Registry (AdapterRAM ist auf 4 GB begrenzt)
$gpus = @(Get-ItemProperty 'HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' |
  Where-Object { $_.DriverDesc } | ForEach-Object {
    $mem = $_.'HardwareInformation.qwMemorySize'
    [ordered]@{ name = "$($_.DriverDesc)"; vram = $(if ($mem) { [math]::Round([double]$mem / 1GB) } else { 0 }) }
  })
if ($gpus.Count -eq 0) {
  $gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { [ordered]@{ name = "$($_.Name)"; vram = 0 } })
}
$r.gpu = $gpus

$disks = @(Get-PhysicalDisk | ForEach-Object {
  [ordered]@{ name = "$($_.FriendlyName)".Trim(); size = [math]::Round($_.Size / 1GB); media = "$($_.MediaType)"; bus = "$($_.BusType)" }
})
if ($disks.Count -eq 0) {
  $disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
    [ordered]@{ name = "$($_.Model)".Trim(); size = [math]::Round($_.Size / 1GB); media = ''; bus = "$($_.InterfaceType)" }
  })
}
$r.disks = $disks

$r.monitors = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID | ForEach-Object {
  [ordered]@{ maker = (Dec $_.ManufacturerName); name = (Dec $_.UserFriendlyName); code = (Dec $_.ProductCodeID) }
})

# Angeschlossene Geraete: Maus, Tastatur, Headset, Webcam, Controller (USB und Bluetooth)
$classes = @('Mouse', 'Keyboard', 'AudioEndpoint', 'Camera', 'Image', 'Bluetooth', 'MEDIA', 'HIDClass', 'XnaComposite', 'USB')
$r.devices = @(Get-PnpDevice -PresentOnly | Where-Object { $classes -contains $_.Class } | ForEach-Object {
  $desc = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_BusReportedDeviceDesc').Data
  $vid = ''
  if ($_.InstanceId -match 'VID_([0-9A-F]{4})') { $vid = $Matches[1] }
  [ordered]@{ cls = "$($_.Class)"; name = "$($_.FriendlyName)"; desc = "$desc"; vid = $vid }
})

$r.os = "$((Get-CimInstance Win32_OperatingSystem).Caption)"

$json = $r | ConvertTo-Json -Depth 6 -Compress
Write-Host ("Gefunden: " + $r.cpu.name + ", " + $r.gpu.Count + " Grafikkarte(n), " + $r.devices.Count + " Geraete")

try {
  Invoke-RestMethod -Uri $upload -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 20 -ErrorAction Stop | Out-Null
  Write-Host 'Fertig! Schau jetzt auf dein Handy.' -ForegroundColor Green
} catch {
  $code = 'SBPC1.' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
  Set-Clipboard -Value $code
  Write-Host 'Dein Handy war nicht erreichbar.' -ForegroundColor Yellow
  Write-Host 'Der Code ist jetzt in der Zwischenablage: Schick ihn dir (z. B. per WhatsApp Web oder Discord)'
  Write-Host 'und fuege ihn in SetupBuilder unter Importieren > Text oder Build-Code ein.'
}
Write-Host ''
