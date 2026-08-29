# Запускает opencode-сервер, доступный с телефона по Wi-Fi.
# Пароль берётся из OPENCODE_SERVER_PASSWORD (или задайте свой).
if (-not $env:OPENCODE_SERVER_PASSWORD) {
  $myPass = Read-Host "OPENCODE_SERVER_PASSWORD не задан. Введите пароль для Basic auth"
  $env:OPENCODE_SERVER_PASSWORD = $myPass
}
opencode serve --hostname 0.0.0.0 --port 41111
