@echo off
setlocal

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not available in PATH
    exit /b 1
)

:: Check if .venv exists
if not exist ".venv\Scripts\activate" (
    echo Creating virtual environment...
    python -m venv .venv

    echo Upgrading pip...
    .venv\Scripts\python.exe -m pip install --upgrade pip

    echo Installing requirements...
    .venv\Scripts\python.exe -m pip install -r requirements.txt
    
    echo Virtual environment created successfully!
)

:: Activate the virtual environment
call .venv\Scripts\activate

:: Debug information
echo Virtual Environment: %VIRTUAL_ENV%

:: Verify Flask is installed
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo Warning: Flask not found in activated environment, installing...
    python -m pip install -r requirements.txt
)

:: Upgrade pip and install/update requirements
if "%~1"=="--update" (
    echo Updating virtual environment and dependencies...
    
    echo Upgrading pip...
    python -m pip install --upgrade pip

    echo Installing/updating requirements...
    python -m pip install -r requirements.txt --upgrade

    shift
)

:: Check if the first command line argument is --dev
if "%~1"=="--dev" (
    python server.py --dev
) else (
    python server.py
)

endlocal
