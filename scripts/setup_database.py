"""Workspace-local development PostgreSQL, never a Windows system service."""
import os
import secrets
import subprocess
from pathlib import Path
from urllib.parse import quote
import psycopg

ROOT=Path(__file__).resolve().parent.parent
RUNTIME=ROOT/'.runtime'
BIN=ROOT/'tools/postgres/pgsql/bin'
DATA=RUNTIME/'pgdata'
RUNTIME.mkdir(exist_ok=True)
FLAGS=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0


def run(*args):
    subprocess.run([str(BIN/args[0]),*map(str,args[1:])],check=True,creationflags=FLAGS,stdout=subprocess.DEVNULL)


if not DATA.exists():
    owner_password=secrets.token_urlsafe(32)
    app_password=secrets.token_urlsafe(32)
    password_file=RUNTIME/'postgres-init.pw'
    password_file.write_text(owner_password,encoding='utf8')
    try:run('initdb.exe','-D',DATA,'-U','scms_owner','--pwfile',password_file,'-A','scram-sha-256','--encoding=UTF8','--locale=C')
    finally:password_file.unlink(missing_ok=True)
    with (DATA/'postgresql.conf').open('a',encoding='utf8') as f:
        f.write("\nlisten_addresses='127.0.0.1'\nport=54329\nshared_buffers='64MB'\nmax_connections=40\n")
    run('pg_ctl.exe','-D',DATA,'-l',RUNTIME/'postgres.log','-w','start')
    with psycopg.connect(host='127.0.0.1',port=54329,user='scms_owner',password=owner_password,dbname='postgres',autocommit=True) as connection:
        from psycopg import sql
        connection.execute(sql.SQL('CREATE ROLE scms LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE').format(sql.Literal(app_password)))
        connection.execute('CREATE DATABASE scms OWNER scms')
        connection.execute('CREATE DATABASE scms_test OWNER scms')
    (RUNTIME/'owner-password').write_text(owner_password,encoding='utf8')
    env=ROOT/'.env'
    if env.exists():raise RuntimeError('Existing .env preserved; configure DATABASE_URL manually.')
    env.write_text('SCMS_ENV=development\nSECRET_KEY='+secrets.token_hex(48)+'\nDATABASE_URL=postgresql+psycopg://scms:'+quote(app_password)+'@127.0.0.1:54329/scms\nRATELIMIT_STORAGE_URI=memory://\n',encoding='utf8')
    print('Local PostgreSQL initialized on 127.0.0.1:54329; .env written without printing secrets.')
else:
    status=subprocess.run([str(BIN/'pg_ctl.exe'),'-D',str(DATA),'status'],creationflags=FLAGS,stdout=subprocess.DEVNULL)
    if status.returncode:run('pg_ctl.exe','-D',DATA,'-l',RUNTIME/'postgres.log','-w','start')
    print('Existing PostgreSQL development cluster is available.')
