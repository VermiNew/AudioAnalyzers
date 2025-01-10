#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
AudioAnalyzers HTTP Server
-------------------------
A Flask server for serving AudioAnalyzers web application.
Author: VermiNew
License: MIT
"""

from flask import Flask, send_from_directory, Response
from waitress import serve
import os
import logging
import argparse
from typing import Tuple
from pathlib import Path


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('AudioAnalyzersServer')

# Initialize Flask app
app = Flask(__name__, static_folder=None)

# Get the directory containing server.py
ROOT_DIR = Path(__file__).resolve().parent


@app.route('/')
def index() -> Response:
    """Serve the index.html file."""
    return send_from_directory(ROOT_DIR, 'index.html')


@app.route('/<path:path>')
def serve_file(path: str) -> Response:
    """Serve static files."""
    try:
        return send_from_directory(ROOT_DIR, path)
    except Exception as e:
        logger.error(f"Error serving {path}: {str(e)}")
        return f"Error: {str(e)}", 500


@app.after_request
def add_cors_headers(response: Response) -> Response:
    """Add CORS headers to all responses."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Max-Age'] = '86400'
    return response


def parse_arguments() -> Tuple[str, int]:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="AudioAnalyzers Flask Server",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    
    parser.add_argument(
        "--host",
        default="localhost",
        help="Host IP address"
    )
    
    parser.add_argument(
        "--port",
        type=int,
        default=5000,
        help="Port number"
    )
    
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Run in development mode with Flask's built-in server"
    )
    
    return parser.parse_args()


def print_server_info(host: str, port: int, dev_mode: bool) -> None:
    """Print server status information."""
    info = f"""
{'='*50}
🚀 AudioAnalyzers Server
{'='*50}
📡 Status    : Running in {'development' if dev_mode else 'production'} mode
🌐 URL       : http://{host}:{port}
💻 Host      : {host}
🔌 Port      : {port}
🛑 Stop      : Press Ctrl+C
{'='*50}
"""
    print(info)
    logger.info(f"Server started in {'development' if dev_mode else 'production'} mode")


def main() -> None:
    """Main entry point of the server."""
    try:
        # Parse arguments
        args = parse_arguments()
        
        # Change to the script's directory
        os.chdir(ROOT_DIR)
        logger.info(f"Working directory set to: {ROOT_DIR}")
        
        # Print server info
        print_server_info(args.host, args.port, args.dev)
        
        if args.dev:
            # Development mode: Use Flask's built-in server
            app.run(
                host=args.host,
                port=args.port,
                debug=True,
                use_reloader=True
            )
        else:
            # Production mode: Use Waitress
            serve(
                app,
                host=args.host,
                port=args.port,
                threads=4,  # Adjust based on your needs
                connection_limit=1000,  # Maximum concurrent connections
                channel_timeout=30,  # Timeout in seconds
                ident='AudioAnalyzers'  # Server identifier
            )
            
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
        print('='*50)
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        print(f"\n❌ Error: {str(e)}")
        raise


if __name__ == "__main__":
    main()
