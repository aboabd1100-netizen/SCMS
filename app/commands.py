import click
from flask.cli import with_appcontext
from sqlalchemy import select
from app.extensions import db
from app.models import Role, User, AppState, InventorySnapshot
from app.utils.security import ROLES, password
from app.services.catalog import uid


@click.command('init-system')
@with_appcontext
def init_system():
    for name in ROLES:
        if not db.session.scalar(select(Role).where(Role.name==name)):db.session.add(Role(name=name))
    if not db.session.get(AppState,1):db.session.add(AppState(id=1,revision=0))
    if not db.session.scalar(select(InventorySnapshot.id)):db.session.add(InventorySnapshot(quantity=0))
    db.session.commit();click.echo('Roles and system settings initialized. No demo business records created.')


@click.command('create-admin')
@click.option('--email',prompt=True)
@click.option('--name',prompt=True)
@click.password_option()
@with_appcontext
def create_admin(email,name,password):
    from app.utils.validation import email as validate_email,text
    from app.utils.security import password as hash_password
    address=validate_email({'email':email})
    if db.session.scalar(select(User.id).where(User.email==address)):raise click.ClickException('Email already exists.')
    role=db.session.scalar(select(Role).where(Role.name=='Admin'))
    if not role:raise click.ClickException('Run init-system first.')
    db.session.add(User(id=uid('USR'),full_name=text({'name':name},'name',100),email=address,password_hash=hash_password(password),role=role,account_type='Internal',preferences={'orders':True,'shipments':True,'offers':True,'inventory':True}))
    db.session.commit();click.echo('Administrator created. Password was not printed or logged.')


def register_commands(app):
    app.cli.add_command(init_system);app.cli.add_command(create_admin)
    app.cli.add_command(refresh_scheduled_notifications)
    app.cli.add_command(production_check)


@click.command('refresh-notifications')
@with_appcontext
def refresh_scheduled_notifications():
    """Run from a scheduler to update date-dependent offers and alerts."""
    from app.services.notifications import refresh_notifications
    state = db.session.scalar(select(AppState).where(AppState.id == 1).with_for_update())
    if not state:raise click.ClickException('Run init-system first.')
    refresh_notifications()
    state.revision += 1
    db.session.commit()
    click.echo('Scheduled notifications refreshed.')


@click.command('production-check')
@with_appcontext
def production_check():
    """Fail release when storage, migrations, or database permissions are unsafe."""
    from flask import current_app
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from alembic.runtime.migration import MigrationContext
    from app.config import ROOT
    from app.extensions import limiter
    if not current_app.config['SESSION_COOKIE_SECURE'] or current_app.config['DEVELOPMENT_SEED']:
        raise click.ClickException('Run with production configuration.')
    flags = db.session.execute(db.text('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user')).one()
    if any(flags):
        raise click.ClickException('Use a PostgreSQL role without superuser, database creation or role creation privileges.')
    cfg = Config(str(ROOT / 'migrations' / 'alembic.ini'))
    cfg.set_main_option('script_location', str(ROOT / 'migrations'))
    heads = set(ScriptDirectory.from_config(cfg).get_heads())
    with db.engine.connect() as connection:
        current = set(MigrationContext.configure(connection).get_current_heads())
    if current != heads:
        raise click.ClickException('Database migrations are not current.')
    if not db.session.get(AppState, 1):
        raise click.ClickException('Run init-system first.')
    if db.session.scalar(select(User.id).where(User.email.in_(('admin@scms.io', 'customer@scms.io')))):
        raise click.ClickException('Development fixture accounts must not be released publicly.')
    from app.utils.security import verify_password
    for user in db.session.scalars(select(User).where(User.status == 'Active')):
        if any(verify_password(user.password_hash, value) for value in ('Admin@12345', 'Customer@12345')):
            raise click.ClickException('An active account still uses a development password. Change it before release.')
    try:
        healthy = limiter.storage.check()
    except Exception:
        healthy = False
    if not healthy:
        raise click.ClickException('Shared rate-limit storage is unavailable.')
    click.echo('PASS: production configuration, restricted database role, migration head, initialization, fixture exclusion and shared rate-limit storage.')
