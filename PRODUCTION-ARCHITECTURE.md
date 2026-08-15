# Xoom Ledger Production Architecture

## Purpose

This document describes how to move the current Xoom Ledger prototype from a setup-free browser app to a secure production application that can later become a multi-tenant SaaS product.

The recommendation is to keep the current visual language and most of the UI work, but replace the client-only storage and authentication model with a server-backed application.

## Executive Recommendation

Use:

- Next.js App Router with TypeScript.
- Vercel for the web application and deployment pipeline.
- Supabase Postgres for the database.
- Supabase Auth for password login, sessions, password resets, and future MFA.
- `@supabase/ssr` for secure server-side sessions in Next.js.
- Supabase Row Level Security for tenant isolation.
- Server-rendered public invoice pages with small client components only for copy buttons.
- Opaque, cryptographically random public invoice IDs that never contain invoice or bank data.
- Application-level encryption for sensitive receiving fields before storing them.
- Playwright for end-to-end testing and automated security checks.

This combination is the fastest path to a secure single-user product while leaving a clean route to workspaces, team members, billing, and multiple customers.

## Current Prototype Assessment

The current Vite React app is useful as a product prototype, but it must not be treated as a security boundary.

Current behavior:

- Admin authentication is a client-side password comparison.
- The password is part of the browser JavaScript bundle. `VITE_ADMIN_PASSWORD` would also be exposed if configured.
- The fallback password `xoom-admin` is present in the built output.
- Admin session state is a `localStorage` boolean.
- Receiving profiles and invoices are stored in `localStorage`.
- Public invoices are encoded into the URL with Base64.
- Base64 is encoding, not encryption.
- The public payload is not signed, so an edited URL can display edited data.
- The public URL contains bank account data, phone data, and other personal information.
- Browser storage is not shared between devices and is lost when storage is cleared.

The prototype has been tested functionally, but these limitations make it unsuitable for real financial information.

## Security Goals

The production application should guarantee the following:

- A user cannot access another user's receiving profiles or invoices.
- A user cannot access another workspace's data, even if they change an API request manually.
- The admin password never appears in browser JavaScript, URLs, logs, or client-side storage.
- Admin sessions use secure, `httpOnly` cookies rather than `localStorage`.
- Public links contain no invoice amount, client name, bank name, account number, phone number, or email address.
- Public links cannot be modified to change the receiving account or amount.
- A public link can be revoked without changing the invoice record.
- Sensitive bank details are encrypted at rest.
- Sensitive data is not sent to third-party analytics providers.
- Login attempts are rate-limited and auditable.
- All admin mutations are validated on the server.
- All database access is protected by Row Level Security policies.
- Backups, retention, and deletion behavior are explicit.

## Threat Model

Protect against:

- A visitor trying to access `/admin` without a valid session.
- A logged-in user changing an invoice ID or workspace ID in a request.
- A malicious user guessing or enumerating public invoice links.
- A recipient changing a public URL before sending money.
- A leaked public URL being forwarded or indexed.
- XSS attempting to read invoice details or session data.
- A compromised browser extension or local machine reading data already shown to the user.
- Accidental logging of bank account numbers or session tokens.
- A database read exposing plaintext receiving details.
- Brute-force and credential-stuffing login attempts.
- A future SaaS customer accessing another customer's records.

Do not promise protection from a compromised device. Once a user or recipient can see an account number on screen, malware or a malicious browser extension can potentially read it.

## Target Architecture

```text
Client browser
    |
    | HTTPS
    v
Vercel / Next.js
    |
    | Server components, route handlers, server actions
    |
    +--> Supabase Auth
    |
    +--> Supabase Postgres with RLS
    |
    +--> Server-side field encryption key
    |
    +--> Optional rate limiter and error monitoring
```

### Why Next.js for the production version

Next.js is React plus the server and deployment conventions needed here.

It gives the project:

- Server components for fast public page delivery.
- Server actions or route handlers for validated mutations.
- Middleware for session refresh and protected route handling.
- Server-only environment variables.
- Built-in metadata and route-level behavior.
- A natural place to set security headers.
- A straightforward path to dynamic routes such as `/i/[publicId]`.

Next.js is not automatically secure. A Next.js static export using `localStorage` and a client-side password check would have the same weaknesses as the current app. The security comes from server-side auth, a database, validation, and correct cookie and database policies.

### Why React was used initially

The repository started empty and the initial request prioritized speed to a working Vercel deployment. React with Vite was the smallest implementation that could provide:

- A fast local development loop.
- A small client bundle.
- No database or service setup.
- A working public link format.
- Easy browser testing of the complete UI.

That was the right choice for a prototype. It is not the best long-term architecture once the app stores real financial information or supports multiple accounts.

## Authentication and Sessions

### Recommended first production version

Use Supabase Auth with email and password.

Required behavior:

- Disable open sign-up after the owner account is created.
- Allow only invited users to create accounts once SaaS work begins.
- Use Supabase's password reset flow.
- Add MFA before onboarding external SaaS customers.
- Refresh sessions through `@supabase/ssr` middleware.
- Store the session in secure, `httpOnly` cookies.
- Use `Secure` cookies in production.
- Use `SameSite=Lax` or stricter where compatible.
- Never store the session token in `localStorage`.
- Never send the Supabase service role key to the browser.

### Protected route behavior

Routes under `/admin` should be checked on the server. The UI may hide or show controls, but the server must reject unauthorized requests.

Expected behavior:

- Unauthenticated request to `/admin` redirects to `/login`.
- Unauthenticated mutation returns `401`.
- Authenticated user without workspace membership returns `403`.
- Deleted, disabled, or expired sessions cannot mutate data.

### Rate limiting

Rate-limit:

- Login attempts by IP and account identifier.
- Password reset requests.
- Public invoice requests by IP if abuse becomes measurable.
- Public link creation and revocation.

Start with a hosted rate limiter such as Upstash Redis or a Vercel-compatible rate limiting service. Do not rely only on in-memory limits in serverless functions.

## Multi-Tenant SaaS Model

Even though the first release has one user, add a workspace boundary from the beginning.

### Workspace concepts

- A user is an authenticated person.
- A workspace owns invoices and receiving profiles.
- A membership connects a user to a workspace.
- A membership has a role.
- An invoice belongs to exactly one workspace.
- A receiving profile belongs to exactly one workspace.

Suggested roles:

- `owner`: billing, deletion, workspace settings, all data.
- `admin`: manage invoices and profiles, no billing changes.
- `member`: create and view invoices, limited profile access.

Do not use `user_id` as the only ownership boundary if SaaS is a real future goal. Use `workspace_id` on every tenant-owned table and enforce it with RLS.

## Database Model

Supabase Auth owns the base user identity. Application tables should use UUID primary keys.

### `workspaces`

- `id uuid primary key`
- `name text not null`
- `slug text unique not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `deleted_at timestamptz null`

### `workspace_members`

- `workspace_id uuid not null references workspaces(id)`
- `user_id uuid not null references auth.users(id)`
- `role text not null`
- `created_at timestamptz not null`
- Composite unique key on `(workspace_id, user_id)`

### `receiving_profiles`

- `id uuid primary key`
- `workspace_id uuid not null`
- `label text not null`
- `first_name_ciphertext text not null`
- `last_name_ciphertext text not null`
- `district_ciphertext text not null`
- `division_ciphertext text not null`
- `postal_code_ciphertext text not null`
- `phone_ciphertext text not null`
- `email_ciphertext text null`
- `bank_name_ciphertext text not null`
- `account_number_ciphertext text not null`
- `created_by uuid not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `archived_at timestamptz null`

The label can be plaintext, such as `Dutch-Bangla Bank - Personal`, so the admin can identify a profile without decrypting every field.

### `invoices`

- `id uuid primary key`
- `workspace_id uuid not null`
- `invoice_number text not null`
- `client_name_ciphertext text not null`
- `description_ciphertext text null`
- `amount_minor bigint not null`
- `currency char(3) not null default 'USD'`
- `due_date date not null`
- `status text not null`
- `public_id_hash text unique not null`
- `public_id_created_at timestamptz not null`
- `public_link_revoked_at timestamptz null`
- `created_by uuid not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `deleted_at timestamptz null`

Store money as integer cents, never floating point. `amount_minor = 32550` represents `$325.50`.

### `invoice_receiving_snapshots`

When an invoice is created, copy the selected receiving profile into an immutable snapshot.

- `id uuid primary key`
- `invoice_id uuid unique not null`
- `first_name_ciphertext text not null`
- `last_name_ciphertext text not null`
- `district_ciphertext text not null`
- `division_ciphertext text not null`
- `postal_code_ciphertext text not null`
- `phone_ciphertext text not null`
- `email_ciphertext text null`
- `bank_name_ciphertext text not null`
- `account_number_ciphertext text not null`
- `created_at timestamptz not null`

Changing a reusable profile must not change the payment details already attached to an invoice.

### `invoice_events`

Use an append-only event table for operational history.

- `id uuid primary key`
- `workspace_id uuid not null`
- `invoice_id uuid not null`
- `actor_user_id uuid null`
- `event_type text not null`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null`

Suggested events:

- `invoice_created`
- `invoice_updated`
- `invoice_marked_paid`
- `invoice_marked_unpaid`
- `public_link_created`
- `public_link_revoked`
- `invoice_deleted`

Do not put account numbers or decrypted bank fields in event metadata.

### SaaS billing tables later

Add only after the single-workspace product is stable:

- `plans`
- `subscriptions`
- `billing_customers`
- `usage_events`

Use Stripe for billing rather than storing card information. Store Stripe customer and subscription IDs, not payment card data.

## Row Level Security

RLS is mandatory. Application code should not be the only place that enforces ownership.

Every workspace-owned table should have policies equivalent to:

```sql
workspace_id in (
  select workspace_id
  from workspace_members
  where user_id = auth.uid()
)
```

Additional rules:

- Owners and admins can create and update profiles.
- Members can only access profiles allowed by product policy.
- Users can read and mutate invoices only inside their workspace.
- Public invoice reads must use a narrowly scoped server-side function or route, not an open table policy.
- The service role key must only be used in trusted server code.
- Add automated tests that attempt cross-workspace reads and writes.

Never accept `workspace_id` from the browser as proof of ownership. Derive the active workspace from the authenticated session and membership lookup.

## Public Invoice Links

### Link format

Use a route such as:

```text
https://app.example.com/i/7v3w5y9r2c4m8q1d6k0p
```

The value after `/i/` should be generated with a cryptographically secure random generator. It should not contain:

- Client name.
- Amount.
- Account number.
- Bank name.
- Profile ID.
- Sequential invoice number.

Store only a hash of the public ID in the database. Hashing limits damage if a database snapshot is leaked, while the original public ID remains usable by the recipient.

### Public request flow

1. Server receives `/i/[publicId]`.
2. Server hashes the ID.
3. Server looks up the hash and checks `revoked_at` and any expiration policy.
4. Server loads the invoice and immutable receiving snapshot.
5. Server decrypts only the fields required for the page.
6. Server renders the public page.
7. Server sends `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`.

If the ID is invalid or revoked, return a generic not-found page. Do not reveal whether an invoice once existed.

### Link integrity

The server must be the source of truth. Never trust an amount, status, bank name, or account number supplied by the public URL.

Support:

- Revoke link.
- Regenerate link.
- Optional expiration date.
- Optional one-time view only if the product later needs it.

Do not make invoice details editable from the public page.

### Caching

Because the public page contains sensitive bank information, start with:

```text
Cache-Control: private, no-store
```

This is slightly slower than publicly caching the page but avoids serving personal payment details from a shared edge cache. Optimize the server query and page shell first. Reconsider short-lived private caching only after measuring real traffic and understanding the privacy tradeoff.

## Encryption and Secrets

### Field encryption

Encrypt sensitive fields before inserting them into Postgres.

At minimum encrypt:

- Account number.
- Phone.
- Email.
- Client name.
- Receiving name and address fields.

Use authenticated encryption such as AES-256-GCM or an audited envelope-encryption library. Store a key version with each ciphertext so keys can be rotated.

The encryption key must be:

- Stored in Vercel server environment variables or a managed secret store.
- Used only in server code.
- Never prefixed with `NEXT_PUBLIC_`.
- Never logged.
- Rotated with a documented migration process.

Use a separate key for production and staging. Do not copy production data into local development.

### Environment variables

Public browser-safe variables may include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only variables include:

- `SUPABASE_SERVICE_ROLE_KEY`
- `FIELD_ENCRYPTION_KEY`
- `APP_SESSION_SECRET` if used by an application session layer.
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Error monitoring server keys.

Anything prefixed with `NEXT_PUBLIC_` must be considered public.

## Validation and Server Boundaries

Use a shared schema library such as Zod for every server action and route handler.

Validate:

- Invoice amount is a positive integer number of cents.
- Currency is an allowed three-letter code.
- Due date is a valid date.
- Required Xoom fields are non-empty after trimming.
- Phone and postal code lengths are bounded.
- Email is valid when present.
- Description and client name have reasonable maximum lengths.
- Public ID has the expected character set and length.

Server code must:

- Re-check authorization after parsing input.
- Load the selected profile from the database.
- Create the invoice and snapshot in one database transaction.
- Generate the public ID on the server.
- Never accept the public token, status owner, amount, or profile snapshot from a hidden browser field.

## Next.js Route Plan

Suggested application routes:

```text
app/
  (auth)/login/page.tsx
  (dashboard)/admin/layout.tsx
  (dashboard)/admin/page.tsx
  (dashboard)/admin/invoices/page.tsx
  (dashboard)/admin/invoices/new/page.tsx
  (dashboard)/admin/profiles/page.tsx
  i/[publicId]/page.tsx
  api/health/route.ts
  api/stripe/webhook/route.ts       # later
```

Use server components for:

- Dashboard data loading.
- Invoice lists.
- Profile lists.
- Public invoice details.

Use client components only for:

- Copy buttons.
- Form interactions.
- Theme toggle.
- Toasts and optimistic UI where useful.

This keeps the public invoice JavaScript small and improves mobile load time.

## Performance Plan

The public invoice is the highest-priority page because clients open it from phones.

### Initial performance targets

- Lighthouse mobile performance at least 90.
- LCP below 2.5 seconds on a simulated mid-tier phone.
- No third-party JavaScript on public invoice pages.
- No client-side database fetch before rendering the invoice.
- Public invoice JavaScript limited to copy controls and lightweight UI state.
- No remote Google Fonts request at runtime. Use `next/font` with a self-hosted or bundled font.
- No unnecessary image assets.
- No analytics on sensitive invoice pages in the first release.

### Rendering strategy

- Server-render the public page from the opaque ID.
- Use `loading.tsx` for dashboard transitions.
- Use skeletons for invoice/profile lists.
- Keep admin data fetching on the server where possible.
- Use database indexes on workspace, status, due date, and public ID hash.
- Paginate invoice history after the list becomes large.
- Avoid shipping the entire admin application bundle to public recipients.

### Client behavior

- Copy only the selected field.
- Show a short copied state.
- Provide a fallback if Clipboard API permissions fail.
- Keep tap targets at least 44px on mobile.
- Respect reduced-motion preferences.

## Security Headers

Configure headers in Next.js and Vercel:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy` with a restrictive allowlist.
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` or an equivalent CSP `frame-ancestors` rule.
- `Permissions-Policy` disabling unused capabilities.
- `X-Robots-Tag: noindex, nofollow` for public invoice pages.

Do not add `unsafe-eval` or broad wildcard script sources unless a dependency demonstrably requires them.

## Logging and Privacy

Never log:

- Passwords.
- Session cookies.
- Supabase service keys.
- Account numbers.
- Phone numbers.
- Email addresses.
- Full public invoice URLs.
- Decrypted receiving profiles.

Log safe identifiers only:

- Internal UUIDs.
- Workspace ID.
- Invoice ID.
- Event type.
- Timestamp.
- Request ID.

For error monitoring, scrub request URLs and request bodies before sending them to the provider.

Add an audit trail for admin actions without copying sensitive field values into the audit record.

## Data Retention and User Controls

Before opening the product to other freelancers, define:

- How long deleted invoices remain recoverable.
- How long audit events are retained.
- How a workspace exports its data.
- How a workspace permanently deletes its data.
- How revoked public links behave.
- Whether invoice snapshots survive profile deletion.
- How backups are encrypted and expired.

A reasonable initial policy is soft-delete for 30 days, then permanent deletion, with a workspace export available to the owner.

Because this app stores personal and banking-related data, add a privacy policy and terms before SaaS launch. Do not claim compliance with a regulation without a legal review.

## Testing Strategy

### Unit tests

Test:

- Currency conversion to integer cents.
- Due date validation.
- Xoom profile validation.
- Public ID generation and hashing.
- Encryption and decryption.
- Link revocation checks.
- Permission helpers.

### Integration tests

Test against a disposable test database:

- User can create a workspace.
- Owner can create a profile.
- Owner can create an invoice.
- Invoice snapshot is immutable after profile changes.
- Invoice creation is transactional.
- Public ID lookup returns only the intended invoice.
- Revoked public ID returns not found.
- Cross-workspace reads fail under RLS.
- Cross-workspace writes fail under RLS.
- Unauthenticated mutations fail.

### End-to-end tests with Playwright

Required flow:

1. Sign in.
2. Create a receiving profile.
3. Create an unpaid invoice.
4. Copy the public link.
5. Open the link in a fresh browser context with no session.
6. Confirm amount, description, due date, bank details, and contact details.
7. Copy every individual field.
8. Revoke the link.
9. Confirm the old link returns not found.
10. Mark the invoice paid from the admin dashboard.
11. Confirm the public page behavior matches the product decision for paid invoices.

### Security regression tests

- Search production bundles for secrets.
- Confirm no sensitive values appear in URLs.
- Confirm no sensitive values appear in logs.
- Confirm cookies have `HttpOnly`, `Secure`, and `SameSite` attributes.
- Confirm the public token cannot be edited into a different invoice.
- Confirm `robots.txt` does not accidentally expose admin paths.
- Confirm CSP blocks inline script injection.
- Confirm rate limits after repeated login failures.
- Run dependency audit in CI.
- Run a dependency update review before every production release.

## CI/CD Plan

Every pull request should run:

```text
typecheck
lint
unit tests
database migration check
integration tests
Playwright smoke tests
npm audit --omit=dev
production build
```

Deploy previews should use a separate Supabase project or isolated database branch. Never connect preview deployments to production data.

Production deployment should require:

- Passing CI.
- Reviewed database migrations.
- A backup or verified rollback plan.
- Environment variable validation.
- A short release note.

## Phased Migration Plan

### Phase 0: Stop unsafe usage

Do this before putting real account data into the prototype:

- Do not use the current app for real bank details.
- Remove demo account data from local storage.
- Treat the fallback password as public.
- Do not share existing prototype links containing test or real data.
- Upgrade the Vite/esbuild development dependency chain.

### Phase 1: Create the production application shell

- Create a Next.js App Router TypeScript application.
- Move the current CSS tokens and visual components across.
- Keep the public invoice design light-only.
- Keep the admin dark-mode option.
- Add `next/font`.
- Add error, loading, and not-found states.
- Add secure headers.

Deliverable: the same visual app with no real data connected.

### Phase 2: Add Supabase Auth and workspaces

- Create production and staging Supabase projects.
- Add email/password authentication.
- Create the first owner account manually.
- Add `workspaces` and `workspace_members`.
- Add server-side route protection.
- Add RLS policies and cross-tenant tests.
- Remove the client-side password comparison.
- Remove the `localStorage` session.

Deliverable: secure dashboard access with server-validated sessions.

### Phase 3: Add profiles and invoices

- Create migrations for profiles, invoices, snapshots, and events.
- Add server-side validation.
- Store amounts as integer cents.
- Encrypt sensitive fields.
- Create invoice and snapshot in one transaction.
- Generate opaque public IDs on the server.
- Replace Base64 public payloads with database lookups.

Deliverable: real data model with stable public links.

### Phase 4: Harden the public link flow

- Add revocation.
- Add optional expiration.
- Add no-index and no-referrer headers.
- Use private no-store caching.
- Add generic not-found behavior.
- Test URL tampering.
- Test links in a fresh browser context.
- Add copy-button fallback and accessibility tests.

Deliverable: safe recipient-facing invoice pages.

### Phase 5: Operability and launch readiness

- Add structured server logs with redaction.
- Add error monitoring with PII scrubbing.
- Add backups and restore drills.
- Add audit events.
- Add workspace export and deletion.
- Add uptime and health checks.
- Add dependency and migration checks in CI.

Deliverable: a product that can be trusted with real customer data.

### Phase 6: SaaS features

- Invite additional workspace members.
- Add role-based permissions.
- Add Stripe billing.
- Add plan limits and usage events.
- Add custom workspace branding.
- Add email delivery for invoice links.
- Add invoice templates and recurring invoices.
- Add workspace-level audit history.
- Add custom domains only after core data isolation is proven.

Deliverable: a multi-tenant product without rewriting the core data model.

## SaaS Product Decisions To Make Later

Do not build these before the secure single-workspace flow is stable:

- Multiple currencies.
- Recurring invoices.
- Automated reminders.
- Client accounts.
- Client payment status webhooks.
- Native Xoom API integration.
- Custom domains.
- Team permissions beyond owner/admin.
- Subscription plans.

Each adds data, permissions, privacy, and support complexity.

## Definition of Production Ready

Do not call the app production-ready until all of the following are true:

- No authentication secret is present in client bundles.
- No invoice or bank details are present in public URLs.
- Public IDs are random and server-validated.
- Public links can be revoked.
- Sessions are secure cookies.
- All tenant tables have tested RLS policies.
- Sensitive fields are encrypted at rest.
- Amounts use integer cents.
- Cross-tenant access tests pass.
- E2E tests cover the complete invoice and copy flow.
- Production and preview data are isolated.
- Backups and restoration have been tested.
- Error logs are scrubbed.
- Security headers are active.
- A privacy policy, retention policy, and deletion flow exist.

## Final Recommendation

Do not rewrite the UI from scratch. Move the visual system and public invoice components into Next.js, then replace the three unsafe foundations:

1. Client-side password check -> Supabase Auth and secure server sessions.
2. `localStorage` -> Postgres with workspace ownership and RLS.
3. Base64 public payload -> random server-side public ID with revocation.

This preserves the speed and design work already completed while making the application defensible for real use and structurally ready for SaaS growth.
