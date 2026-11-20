// The start-up role check (ADR 0009: the app connects as a non-owner role so
// row-level security applies).
//
// Row-level security does not apply to a superuser or a BYPASSRLS login, and a
// table owner (or a member of the owning role) can switch it off. On a deployed
// host the app login must therefore own nothing, must be able to SET ROLE
// rolewright_app for user data, and must reach the system tables through
// rolewright_system. Pure apart from ROLE_QUERY, which index.mjs runs.

export const APP_ROLE = "rolewright_app";
export const SYSTEM_ROLE = "rolewright_system";

/**
 * One statement, catalog only, that describes current_user. It never throws on a
 * database where the roles have not been created yet (they read as not held).
 *
 * - memberOfApp: may SET ROLE rolewright_app (MEMBER).
 * - memberOfSystem: holds rolewright_system's privileges without SET ROLE
 *   (USAGE, i.e. inherited), because db.system queries never switch role.
 * - ownedUserTables: public tables with row-level security or a user_id column
 *   whose owner current_user is or can become (MEMBER: inherited or SET-only
 *   membership both let it act as the owner).
 * - app*: the same facts about rolewright_app itself. withUser runs every
 *   user-data query as that role, so its own attributes decide whether row-level
 *   security applies. NULL (unsafe) when the role does not exist.
 */
export const ROLE_QUERY = `
SELECT r.rolsuper AS "rolsuper",
       r.rolbypassrls AS "rolbypassrls",
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}')
            THEN pg_has_role(current_user, '${APP_ROLE}', 'MEMBER') ELSE false END AS "memberOfApp",
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${SYSTEM_ROLE}')
            THEN pg_has_role(current_user, '${SYSTEM_ROLE}', 'USAGE') ELSE false END AS "memberOfSystem",
       ARRAY(
         SELECT c.relname::text
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
           AND (c.relrowsecurity OR EXISTS (
                 SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped))
           AND pg_has_role(current_user, c.relowner, 'MEMBER')
         ORDER BY c.relname
       ) AS "ownedUserTables",
       (SELECT a.rolsuper FROM pg_roles a WHERE a.rolname = '${APP_ROLE}') AS "appSuper",
       (SELECT a.rolbypassrls FROM pg_roles a WHERE a.rolname = '${APP_ROLE}') AS "appBypassRls",
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}')
             AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${SYSTEM_ROLE}')
            THEN pg_has_role('${APP_ROLE}', '${SYSTEM_ROLE}', 'MEMBER') ELSE false END AS "appInSystem",
       ARRAY(
         SELECT c.relname::text
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
           AND (c.relrowsecurity OR EXISTS (
                 SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped))
           AND EXISTS (SELECT 1 FROM pg_roles a WHERE a.rolname = '${APP_ROLE}' AND pg_has_role(a.oid, c.relowner, 'MEMBER'))
         ORDER BY c.relname
       ) AS "appOwnedUserTables"
FROM pg_roles r
WHERE r.rolname = current_user`;

/**
 * What is wrong with the connecting login, in plain words. Empty means safe.
 * Fails closed: a field that is missing or not a boolean counts as unsafe.
 * @param {{ rolsuper?: boolean, rolbypassrls?: boolean, memberOfApp?: boolean,
 *   memberOfSystem?: boolean, ownedUserTables?: string[], appSuper?: boolean | null,
 *   appBypassRls?: boolean | null, appInSystem?: boolean | null,
 *   appOwnedUserTables?: string[] } | undefined} role
 * @param {{ deployed: boolean }} opts deployed: the app ran no migration and
 *   must not own anything
 * @returns {string[]}
 */
export function roleProblems(role, { deployed }) {
  const r = role ?? {};
  const problems = [];
  if (r.rolsuper !== false) {
    problems.push("The database login is a superuser, so row-level security does not apply to it. Connect as an ordinary login.");
  }
  if (r.rolbypassrls !== false) {
    problems.push("The database login has BYPASSRLS, so row-level security does not apply to it. Use a login created with NOBYPASSRLS.");
  }
  if (r.memberOfApp !== true) {
    problems.push(`The database login is not a member of ${APP_ROLE}, so it cannot enter a user's row-level-security scope. Run GRANT ${APP_ROLE} TO <login>.`);
  }
  if (r.appSuper !== false) {
    problems.push(`${APP_ROLE} is a superuser (or its attributes could not be read), so user-data queries skip row-level security. Run ALTER ROLE ${APP_ROLE} NOSUPERUSER.`);
  }
  if (r.appBypassRls !== false) {
    problems.push(`${APP_ROLE} has BYPASSRLS (or its attributes could not be read), so user-data queries skip row-level security. Run ALTER ROLE ${APP_ROLE} NOBYPASSRLS.`);
  }
  if (deployed) {
    if (r.appInSystem !== false) {
      problems.push(`${APP_ROLE} is a member of ${SYSTEM_ROLE}, so a user's scope could reach the sign-in tables. Run REVOKE ${SYSTEM_ROLE} FROM ${APP_ROLE}.`);
    }
    const appOwned = r.appOwnedUserTables;
    if (!Array.isArray(appOwned)) {
      problems.push(`Could not tell which tables ${APP_ROLE} owns.`);
    } else if (appOwned.length) {
      problems.push(`${APP_ROLE} owns (or is a member of the role that owns) these tables, so a user's scope could switch off their row-level security: ${appOwned.join(", ")}.`);
    }
    if (r.memberOfSystem !== true) {
      problems.push(`The database login does not hold ${SYSTEM_ROLE}, so it cannot reach the sign-in tables. Run GRANT ${SYSTEM_ROLE} TO <login>.`);
    }
    const owned = r.ownedUserTables;
    if (!Array.isArray(owned)) {
      problems.push("Could not tell which tables the database login owns.");
    } else if (owned.length) {
      problems.push(`The database login owns (or is a member of the role that owns) these tables, so it could switch off their row-level security: ${owned.join(", ")}. Tables belong to the migration login; the app login should own nothing.`);
    }
  }
  return problems;
}

/**
 * The tables a schema script creates, in order, so the start-up probe checks
 * every table without keeping a second list (a block appended later is
 * included automatically).
 * @param {string} sql
 * @returns {string[]}
 */
export function tablesInSchema(sql) {
  const names = [];
  for (const m of sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi)) {
    const name = m[1] ?? m[2].toLowerCase(); // Postgres folds unquoted names
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
