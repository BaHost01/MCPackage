@echo off
setlocal

REM ===== CONFIG =====
set REPO_NAME=MCPackage
set VISIBILITY=public
REM ==================

echo Inicializando git (se necessario)...
git init

echo Criando README.md...
if not exist README.md (
    echo # %REPO_NAME%>README.md
)

echo Criando commit inicial...
git add .
git commit -m "Initial commit"

echo Criando repositorio no GitHub e dando push...
gh repo create %REPO_NAME% --%VISIBILITY% --source=. --remote=origin --push

if %errorlevel% neq 0 (
    echo ERRO ao criar o repositorio no GitHub.
    pause
    exit /b
)

echo ===============================
echo Repo criado e enviado com sucesso
echo ===============================
pause
