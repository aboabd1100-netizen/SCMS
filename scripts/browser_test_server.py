"""Serve isolated browser fixtures; never write to the working SCMS database."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sqlalchemy.engine import make_url
from flask_migrate import upgrade
from app import create_app
from app.extensions import db
from seed import seed

base = create_app()
url = make_url(base.config['SQLALCHEMY_DATABASE_URI']).set(database='scms_test')
app = create_app({'TESTING': True, 'RATELIMIT_ENABLED': False,
                  'SQLALCHEMY_DATABASE_URI': url.render_as_string(hide_password=False)})
if __name__ == '__main__':
    if '--reset-test-database' not in sys.argv:
        raise SystemExit('Requires --reset-test-database; only scms_test may be reset.')
    with app.app_context():
        assert db.engine.url.database == 'scms_test'
        db.drop_all()
        db.session.execute(db.text('DROP TABLE IF EXISTS alembic_version'))
        db.session.commit()
        upgrade(directory=str(Path(__file__).resolve().parent.parent / 'migrations'))
        seed()
    # Loopback only. This process must never be used as a public production server.
    app.run(host='127.0.0.1', port=5002, debug=False, use_reloader=False)
