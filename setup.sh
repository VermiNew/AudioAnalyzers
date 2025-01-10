#!/bin/bash

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed or not available in PATH"
    exit 1
fi

# Check if .venv exists
if [ ! -f ".venv/bin/activate" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv

    echo "Upgrading pip..."
    .venv/bin/python -m pip install --upgrade pip

    echo "Installing requirements..."
    .venv/bin/python -m pip install -r requirements.txt
    
    echo "Virtual environment created successfully!"
fi

# Activate the virtual environment
source .venv/bin/activate

# Debug information
echo "Virtual Environment: $VIRTUAL_ENV"

# Verify Flask is installed
python3 -c "import flask" &> /dev/null
if [ $? -ne 0 ]; then
    echo "Warning: Flask not found in activated environment, installing..."
    python3 -m pip install -r requirements.txt
fi

# Upgrade pip and install/update requirements
if [ "$1" = "--update" ]; then
    echo "Updating virtual environment and dependencies..."
    
    echo "Upgrading pip..."
    python3 -m pip install --upgrade pip

    echo "Installing/updating requirements..."
    python3 -m pip install -r requirements.txt --upgrade

    shift
fi

# Check if the first argument is --dev
if [ "$1" = "--dev" ]; then
    python3 server.py --dev
else
    python3 server.py
fi
