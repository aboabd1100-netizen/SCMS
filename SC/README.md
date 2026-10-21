# SCMS frontend

The existing HTML/CSS/JavaScript interface is served by the Flask application
in the project root. Run `.venv\Scripts\python run.py` from the root and open
http://127.0.0.1:5000/. A static server cannot provide the required APIs.

Business records, backend authorization and opaque sessions use PostgreSQL.
Browser storage holds only theme, language and display preferences. Development
fixtures are managed explicitly by the root seed.py and excluded from production.

See the root README and DEPLOYMENT.md for setup, tests and deployment status.
