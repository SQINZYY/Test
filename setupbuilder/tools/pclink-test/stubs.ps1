function New-Obj($h) { [pscustomobject]$h }
function Get-CimInstance { param([Parameter(Position=0)]$ClassName, $Namespace)
  switch ($ClassName) {
    'Win32_Processor' { New-Obj @{ Name = 'AMD Ryzen 7 7800X3D 8-Core Processor           '; NumberOfCores = 8; NumberOfLogicalProcessors = 16 } }
    'Win32_BaseBoard' { New-Obj @{ Manufacturer = 'ASUSTeK COMPUTER INC.'; Product = 'ROG STRIX B650E-F GAMING WIFI' } }
    'Win32_PhysicalMemory' { 1..2 | % { New-Obj @{ Capacity = 17179869184; ConfiguredClockSpeed = 6000; Speed = 6000; SMBIOSMemoryType = 34; PartNumber = 'KF560C30-16         '; Manufacturer = 'Kingston' } } }
    'Win32_VideoController' { New-Obj @{ Name = 'NVIDIA GeForce RTX 4070 SUPER' } }
    'Win32_DiskDrive' { }
    'WmiMonitorID' { New-Obj @{ ManufacturerName = [uint16[]](71,83,77,0,0); UserFriendlyName = [uint16[]](76,71,32,85,76,84,82,65,71,69,65,82,0,0); ProductCodeID = [uint16[]](53,66,66,70,0) } }
    'Win32_OperatingSystem' { New-Obj @{ Caption = 'Microsoft Windows 11 Home' } }
  } }
function Get-ItemProperty { param($Path)
  New-Obj @{ DriverDesc = 'NVIDIA GeForce RTX 4070 SUPER'; 'HardwareInformation.qwMemorySize' = 12884901888 }
  New-Obj @{ DriverDesc = 'AMD Radeon(TM) Graphics'; 'HardwareInformation.qwMemorySize' = 536870912 } }
function Get-PhysicalDisk { New-Obj @{ FriendlyName = 'Samsung SSD 990 PRO 2TB'; Size = 2000398934016; MediaType = 'SSD'; BusType = 'NVMe' }
  New-Obj @{ FriendlyName = 'ST2000DM008-2FR102'; Size = 2000398934016; MediaType = 'HDD'; BusType = 'SATA' }
  New-Obj @{ FriendlyName = 'SanDisk Ultra USB 3.0'; Size = 61530439680; MediaType = 'Unspecified'; BusType = 'USB' } }
$global:devs = @(
  @('Mouse','HID-compliant mouse','G502 X','HID\VID_046D&PID_C099&MI_00\8&1'),
  @('Keyboard','HID Keyboard Device','Wooting 60HE+','HID\VID_31E3&PID_1312&MI_00\8&2'),
  @('HIDClass','USB Input Device','Wooting 60HE+','USB\VID_31E3&PID_1312&MI_02\7&3'),
  @('AudioEndpoint','Headphones (Arctis Nova 7)','','SWD\MMDEVAPI\{0.0.0.00000000}.{a}'),
  @('AudioEndpoint','Speakers (Realtek(R) Audio)','','SWD\MMDEVAPI\{0.0.0.00000000}.{b}'),
  @('AudioEndpoint','Microphone (Elgato Wave:3)','','SWD\MMDEVAPI\{0.0.1.00000000}.{c}'),
  @('MEDIA','Arctis Nova 7','Arctis Nova 7','USB\VID_1038&PID_2202&MI_00\7&4'),
  @('Camera','Logitech BRIO','Logitech BRIO','USB\VID_046D&PID_085E&MI_00\7&5'),
  @('XnaComposite','Xbox Wireless Controller','','USB\VID_045E&PID_0B12\6'),
  @('USB','USB Composite Device','USB Receiver','USB\VID_046D&PID_C547\7'),
  @('USB','USB Root Hub (USB 3.0)','','USB\ROOT_HUB30\4'),
  @('Bluetooth','WH-1000XM4','','BTHENUM\{1}'),
  @('Bluetooth','Microsoft Bluetooth Enumerator','','BTH\MS_BTHBRB\7'),
  @('Keyboard','HID Keyboard Device','USB Receiver','HID\VID_046D&PID_C547&MI_00\8&9')
)
function Get-PnpDevice { param([switch]$PresentOnly) foreach ($d in $global:devs) { New-Obj @{ Class = $d[0]; FriendlyName = $d[1]; InstanceId = $d[3] } } }
function Get-PnpDeviceProperty { param($InstanceId, $KeyName) $d = $global:devs | ? { $_[3] -eq $InstanceId } | select -First 1; New-Obj @{ Data = $d[2] } }
function Set-Clipboard { param($Value) Set-Content -Path ./clipboard.txt -Value $Value }
