$body = @{ email = "admin@example.com"; password = "admin123" } | ConvertTo-Json -Depth 10
try {
  $res = Invoke-RestMethod -Uri "http://localhost:8000/api/login" -Method Post -ContentType "application/json" -Body $body -ErrorAction Stop
  $res | ConvertTo-Json -Depth 10 | Write-Output
} catch {
  Write-Output "ERROR:"
  Write-Output $_.Exception.Message
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-Output $_.ErrorDetails.Message }
}

