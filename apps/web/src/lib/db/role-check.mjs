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
 *   whose owner's rights current_user has, directly or through membership.
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
           AND pg_has_role(current_user, c.relowner, 'USAGE')
         ORDER BY c.relname
       ) AS "ownedUserTables"
FROM pg_roles r
WHERE r.rolname = current_user`;

/**
 * What is wrong with the connecting login, in plain words. Empty means safe.
 * Fails closed: a field that is missing or not a boolean counts as unsafe.
 * @param {{ rolsuper?: boolean, rolbypassrls?: boolean, memberOfApp?: boolean,
 *   memberOfSystem?: boolean, ownedUserTables?: string[] } | undefined} role
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
  if (deployed) {
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
