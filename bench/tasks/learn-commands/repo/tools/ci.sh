#!/bin/sh
# The checks live outside the package and are not named test_*.py, so plain unittest finds nothing.
cd "$(dirname "$0")/.." && PYTHONPATH=lib python3 -m unittest discover -s checks -p 'case_*.py' "$@"
