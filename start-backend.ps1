$localSecrets = Join-Path $PSScriptRoot "secrets.local.ps1"
if (Test-Path $localSecrets) {
  . $localSecrets
} else {
  $secureKey = Read-Host "Gemini API key" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $env:GEMINI_MODEL = "gemini-3.6-flash"
}
try {
  uvicorn odd_scout.api.main:app --reload --host 127.0.0.1 --port 8000
} finally {
  Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:GEMINI_MODEL -ErrorAction SilentlyContinue
}
