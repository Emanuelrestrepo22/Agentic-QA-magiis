/**
 * Oracle DB client (thin mode) — validación de datos para tests.
 *
 * Usa `oracledb` en modo thin (por defecto en v6+), NO requiere Oracle Instant Client.
 * Credenciales desde `config.db.oracleTest` (única fuente = @variables → .env: ORACLE_*_TEST).
 *
 * Contrato: fail-fast. Estas funciones se usan para ASSERTIONS de datos, por lo que
 * un error de conexión/consulta debe romper el test, no silenciarse.
 */

import type { BindParameters, Connection } from 'oracledb';

import { config } from '@variables';
import oracledb from 'oracledb';

// Devuelve filas como objetos { COLUMN: value } en lugar de arrays.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

/**
 * ¿Están las credenciales Oracle de TEST configuradas en .env?
 * Úsalo para `test.skip()` cuando la validación DB no pueda ejecutarse.
 */
export function isOracleTestConfigured(): boolean {
  return config.db.oracleTest.isConfigured;
}

/**
 * Abre una conexión Oracle TEST, ejecuta el callback y cierra siempre la conexión.
 * @throws si las credenciales no están configuradas o la conexión/consulta falla.
 */
export async function withOracleTest<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const { user, password, connectString, isConfigured } = config.db.oracleTest;
  if (!isConfigured) {
    throw new Error(
      'Oracle TEST no configurado. Define ORACLE_HOST_TEST / ORACLE_SERVICE_TEST / '
      + 'ORACLE_USER_TEST / ORACLE_PASSWORD_TEST en .env.',
    );
  }

  const connection = await oracledb.getConnection({ user, password, connectString });
  try {
    return await fn(connection);
  }
  finally {
    await connection.close();
  }
}

/**
 * Ejecuta un SELECT y devuelve las filas tipadas.
 * @param conn conexión Oracle abierta.
 * @param sql SQL con binds nombrados (`:name`).
 * @param binds valores para los binds.
 */
export async function queryRows<T = Record<string, unknown>>(
  conn: Connection,
  sql: string,
  binds: BindParameters = {},
): Promise<T[]> {
  const result = await conn.execute(sql, binds);
  return (result.rows ?? []) as T[];
}

/**
 * Ejecuta un `SELECT COUNT(*) AS CNT ...` y devuelve el entero.
 */
export async function queryCount(
  conn: Connection,
  sql: string,
  binds: BindParameters = {},
): Promise<number> {
  const rows = await queryRows<{ CNT: number }>(conn, sql, binds);
  return rows[0]?.CNT ?? 0;
}
