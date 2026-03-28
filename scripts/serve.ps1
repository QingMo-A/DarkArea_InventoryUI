param(
  [int]$Port = 8080,
  [string]$Root = 'F:\DarkArea_InventoryUI'
)

Write-Host "Serving $Root at http://127.0.0.1:$Port/"
node 'F:\DarkArea_InventoryUI\scripts\serve.js' $Port $Root
