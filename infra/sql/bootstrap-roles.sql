-- One-time database bootstrap for Rolewright on Cloud SQL (ADR 0009, runbook step 3).
--
-- Run with psql as the built-in `postgres` user, connected to the `postgres`
-- database, passing the two passwords as psql variables so they never appear in
-- this file or in shell history:
--
--   psql "host=<private-ip> user=postgres dbname=postgres sslmode=require" \
--     -v owner_password="$OWNER_PW" -v login_password="$LOGIN_PW" \
--     -f infra/sql/bootstrap-roles.sql
--
-- Safe to re-run: existing roles are kept (their passwords are only set on creation).

\set ON_ERROR_STOP on

-- Owner of the database and the tables; used only by the migration job.
SELECT format('CREATE ROLE rolewright_owner LOGIN PASSWORD %L', :'owner_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rolewright_owner')\gexec

-- The app's login: ordinary, no special attributes, row-level security applies.
SELECT format('CREATE ROLE rolewright_login LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', :'login_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rolewright_login')\gexec

-- Roles nobody logs in as. rolewright_app runs user-data queries (SET ROLE);
-- rolewright_system holds grants on the system tables.
SELECT 'CREATE ROLE rolewright_app NOLOGIN NOSUPERUSER NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rolewright_app')\gexec
SELECT 'CREATE ROLE rolewright_system NOLOGIN NOSUPERUSER NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rolewright_system')\gexec

GRANT rolewright_app, rolewright_system TO rolewright_login;

-- On Cloud SQL the postgres user is not a true superuser: it must be a member
-- of a role before it can create a database owned by that role.
GRANT rolewright_owner TO postgres;

SELECT 'CREATE DATABASE rolewright OWNER rolewright_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'rolewright')\gexec

\connect rolewright

REVOKE ALL ON DATABASE rolewright FROM PUBLIC;
GRANT CONNECT ON DATABASE rolewright TO rolewright_login;
GRANT USAGE ON SCHEMA public TO rolewright_login;
