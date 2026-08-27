@echo off
echo.
echo  ========================================
echo   Analyza - Instalacao
echo  ========================================
echo.

:: Verificar se Node.js esta instalado
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado!
    echo.
    echo  Baixe e instale em: https://nodejs.org
    echo  Escolha a versao LTS.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js encontrado: 
node --version

:: Verificar se .env existe
if not exist ".env" (
    echo.
    echo [AVISO] Arquivo .env nao encontrado.
    echo  Copiando .env.example para .env...
    copy ".env.example" ".env"
    echo.
    echo  !! IMPORTANTE: Abra o arquivo .env e preencha suas chaves antes de iniciar !!
    echo.
)

echo.
echo  Instalando dependencias (npm install)...
echo.
npm install

if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar dependencias.
    pause
    exit /b 1
)

echo.
echo  ========================================
echo   Instalacao concluida!
echo  ========================================
echo.
echo  Proximos passos:
echo    1. Edite o arquivo .env com suas chaves
echo    2. Execute: iniciar.bat
echo.
pause
