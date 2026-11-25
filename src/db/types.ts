// Type-only helpers so handlers and queries can take either the shared client or a transaction.
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** What query helpers accept: the client or an open transaction. */
export type DbOrTx = Db | Tx;
