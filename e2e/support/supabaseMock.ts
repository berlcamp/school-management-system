/**
 * A tiny in-memory stand-in for the Supabase REST + auth endpoints.
 *
 * Every test runs against this rather than a database. It is not a general
 * PostgREST emulator — it understands only the handful of query shapes these
 * pages issue — but it is strict where it matters: an unrecognised request to
 * the Supabase host is ABORTED, not quietly answered with an empty array, so a
 * page that starts calling something new fails loudly in review instead of
 * passing on a silent empty result.
 *
 * The mock also records writes, which is what the assertions are made of: the
 * point of the answer-key test is what got PUT, not what the toast said.
 */

import type { BrowserContext, Page, Route } from "@playwright/test";

export const SUPABASE_URL = "https://e2etest.supabase.co";
const PROJECT_REF = "e2etest";
export const AUTH_COOKIE = `sb-${PROJECT_REF}-auth-token`;

export const TEST_USER = {
  authId: "11111111-1111-4111-8111-111111111111",
  email: "teacher@e2e.test",
  systemUserId: 501,
  name: "Test Teacher",
  type: "teacher",
  schoolId: 7,
};

export interface RecordedWrite {
  method: string;
  table: string;
  body: unknown;
  url: string;
}

/** Rows keyed by table name; a handler may also compute a response. */
export type TableRows = Record<string, unknown[]>;

/**
 * Responses for `POST /rest/v1/rpc/<name>`, keyed by function name and given
 * the arguments the page sent. Without one, an RPC falls through to the write
 * branch below, which echoes the request back — fine for recording that a call
 * happened, useless for a page that renders what the call returned.
 */
export type RpcHandlers = Record<
  string,
  (args: Record<string, unknown>) => unknown
>;

export interface SupabaseMock {
  writes: RecordedWrite[];
  /** Replace a table's rows mid-test (e.g. after a simulated save). */
  setRows: (table: string, rows: unknown[]) => void;
  writesTo: (table: string) => RecordedWrite[];
}

/**
 * Seed an authenticated session.
 *
 * @supabase/ssr stores the session in a cookie named for the project ref, as
 * `base64-` followed by base64url JSON. Writing it directly is what lets a test
 * start on a protected page without driving a login form that talks to a real
 * identity provider.
 */
export async function seedSession(context: BrowserContext, baseURL: string) {
  const session = {
    access_token: "e2e-access-token",
    refresh_token: "e2e-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    // Far future: getSession() must not decide it needs to refresh.
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    user: {
      id: TEST_USER.authId,
      aud: "authenticated",
      role: "authenticated",
      email: TEST_USER.email,
      email_confirmed_at: "2024-01-01T00:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
    },
  };

  const encoded =
    "base64-" +
    Buffer.from(JSON.stringify(session), "utf8").toString("base64url");

  await context.addCookies([
    {
      name: AUTH_COOKIE,
      value: encoded,
      url: baseURL,
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Intercept every call to the Supabase host and answer it from `rows`.
 *
 * Reads honour the filters these pages actually use (eq, in, is, or, order,
 * limit) — enough that a page filtering by exam and school year gets a
 * different answer than one that does not, which is the difference between a
 * test and a screenshot.
 */
export async function installSupabaseMock(
  page: Page,
  initialRows: TableRows = {},
  rpcHandlers: RpcHandlers = {},
): Promise<SupabaseMock> {
  const rows: TableRows = {
    sms_users: [
      {
        id: TEST_USER.systemUserId,
        user_id: TEST_USER.authId,
        email: TEST_USER.email,
        name: TEST_USER.name,
        type: TEST_USER.type,
        school_id: TEST_USER.schoolId,
        is_active: true,
        position: "Teacher III",
      },
    ],
    sms_aral_tutors: [],
    sms_schools: [{ id: TEST_USER.schoolId, name: "E2E Elementary School" }],
    sms_notifications: [],
    ...initialRows,
  };

  const writes: RecordedWrite[] = [];

  await page.route(`${SUPABASE_URL}/**`, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname.startsWith("/auth/v1/")) {
      return handleAuth(route, url);
    }

    if (!url.pathname.startsWith("/rest/v1/")) {
      // Storage, realtime, functions: nothing here should reach them.
      return route.abort();
    }

    const table = url.pathname.replace("/rest/v1/", "");

    if (table.startsWith("rpc/")) {
      const name = table.slice("rpc/".length);
      let args: Record<string, unknown> = {};
      try {
        args = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      } catch {
        args = {};
      }
      // Recorded either way, so a spec can assert on what the page ASKED for
      // and not only on what it drew.
      writes.push({ method, table, body: args, url: request.url() });

      const handler = rpcHandlers[name];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        // An unhandled RPC answers empty rather than echoing the request back:
        // a page rendering its own arguments is a confusing way to fail.
        body: JSON.stringify(handler ? handler(args) : []),
      });
    }

    if (method === "POST" || method === "PATCH" || method === "PUT") {
      let body: unknown = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      writes.push({ method, table, body, url: request.url() });

      const returned = Array.isArray(body) ? body : [body];
      return route.fulfill({
        status: method === "POST" ? 201 : 200,
        contentType: "application/json",
        headers: { "content-range": `0-${returned.length - 1}/*` },
        body: JSON.stringify(
          wantsSingleObject(request.headers()) ? (returned[0] ?? {}) : returned,
        ),
      });
    }

    if (method === "DELETE") {
      writes.push({ method, table, body: null, url: request.url() });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "*/0" },
        body: "[]",
      });
    }

    if (method !== "GET" && method !== "HEAD") return route.abort();

    const result = selectRows(rows[table] ?? [], url);
    const single = wantsSingleObject(request.headers());

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": `0-${Math.max(0, result.length - 1)}/${result.length}` },
      body: single
        ? JSON.stringify(result[0] ?? null)
        : JSON.stringify(result),
    });
  });

  return {
    writes,
    setRows: (table, next) => {
      rows[table] = next;
    },
    writesTo: (table) => writes.filter((w) => w.table === table),
  };
}

function handleAuth(route: Route, url: URL) {
  if (url.pathname.endsWith("/user")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: TEST_USER.authId,
        email: TEST_USER.email,
        aud: "authenticated",
        role: "authenticated",
      }),
    });
  }
  // Token refresh and everything else: succeed emptily rather than 500, which
  // would make supabase-js drop the seeded session.
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "{}",
  });
}

/** PostgREST signals "give me one object" through the Accept header. */
function wantsSingleObject(headers: Record<string, string>): boolean {
  const accept = headers["accept"] ?? "";
  return accept.includes("application/vnd.pgrst.object+json");
}

interface QueryRow {
  [key: string]: unknown;
}

/** Apply the subset of PostgREST filters these pages use. */
function selectRows(source: unknown[], url: URL): unknown[] {
  let result = [...source] as QueryRow[];

  for (const [key, raw] of url.searchParams.entries()) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    // Filters on an embedded resource ("tos.grade_level") are not modelled;
    // the seeded row carries the embed whole.
    if (key.includes(".")) continue;

    if (key === "or") {
      const clauses = raw.replace(/^\(|\)$/g, "").split(",");
      result = result.filter((row) =>
        clauses.some((clause) => {
          const [column, op, ...rest] = clause.split(".");
          return matches(row[column], `${op}.${rest.join(".")}`);
        }),
      );
      continue;
    }

    result = result.filter((row) => matches(row[key], raw));
  }

  const order = url.searchParams.get("order");
  if (order) {
    for (const clause of order.split(",").reverse()) {
      const [column, direction] = clause.split(".");
      result.sort((a, b) => {
        const left = a[column];
        const right = b[column];
        const cmp =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""));
        return direction === "desc" ? -cmp : cmp;
      });
    }
  }

  return result;
}

function matches(value: unknown, expression: string): boolean {
  const [op, ...rest] = expression.split(".");
  const operand = rest.join(".");

  switch (op) {
    case "eq":
      return String(value) === operand;
    case "neq":
      return String(value) !== operand;
    case "is":
      return operand === "null" ? value == null : String(value) === operand;
    case "in": {
      const set = operand
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((v) => v.replace(/^"|"$/g, ""));
      return set.includes(String(value));
    }
    case "not": {
      // "not.in.(1,2)" — the only negation these pages issue.
      const [innerOp, ...innerRest] = rest;
      return !matches(value, `${innerOp}.${innerRest.join(".")}`);
    }
    case "gte":
      return Number(value) >= Number(operand);
    case "lte":
      return Number(value) <= Number(operand);
    case "ilike":
      return String(value)
        .toLowerCase()
        .includes(operand.replace(/%/g, "").toLowerCase());
    default:
      return true;
  }
}
