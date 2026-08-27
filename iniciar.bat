@echo off
echo.
echo  ========================================
echo   Analyza - Iniciando servidor
echo  ========================================
echo.

if not exist "node_modules" (
    echo [AVISO] node_modules nao encontrado.
    echo  Execute instalar.bat primeiro!
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [AVISO] Arquivo .env nao encontrado.
    echo  Copie .env.example para .env e preencha as chaves.
    echo.
    pause
    exit /b 1
)

echo  Servidor iniciando em http://localhost:3000
echo  Pressione Ctrl+C para parar.
echo.

node server.js
pause
