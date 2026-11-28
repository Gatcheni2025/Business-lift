#ifndef PublishDir
  #error "Supply the verified publish directory."
#endif
#ifndef OutputDir
  #error "Supply the output directory."
#endif
#ifndef IconPath
  #error "Supply the Teyza icon."
#endif
[Setup]
AppId={{C7F96CF2-7A44-4B42-82DD-8A27C8DA6516}
AppName=Teyza Admin
AppVersion=1.0.0
AppPublisher=TEYZA SA (PTY) LTD
AppPublisherURL=https://teyza.co.za/
DefaultDirName={localappdata}\Programs\Teyza Admin
DefaultGroupName=Teyza Admin
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutputDir}
OutputBaseFilename=Teyza-Admin-Windows-1.0.0-x64-QA-Setup
SetupIconFile={#IconPath}
UninstallDisplayIcon={app}\TeyzaAdmin.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"
[Icons]
Name: "{group}\Teyza Admin"; Filename: "{app}\TeyzaAdmin.exe"
Name: "{userdesktop}\Teyza Admin"; Filename: "{app}\TeyzaAdmin.exe"; Tasks: desktopicon
