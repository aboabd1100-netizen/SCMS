from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy(session_options={"expire_on_commit": False})
migrate = Migrate()
limiter = Limiter(key_func=get_remote_address, default_limits=["300 per minute"])
