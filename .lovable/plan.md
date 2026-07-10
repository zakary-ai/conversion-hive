## Support Tickets / Suggestions

In-app ticket system so any signed-in user (setter, closer, DM setter, DM manager, admin) can submit feedback, suggestions, or issues, and admins can respond in a thread. Includes media attachments (5MB max per file).

### User side

- New sidebar + bottom-nav item **"Support"** on every role (`/app/support`).
- **New ticket** dialog:
  - **Category** select: Feedback, Suggestion, Issue/Bug, Other
  - **Subject** (required, max 120 chars)
  - **Message** (textarea, required, max 4000 chars)
  - **Attachments** (optional): up to 5 files, **5 MB max each**, images/video/pdf. Client-side size + type check before upload; server also enforces.
- **My tickets** list: subject, category badge, status (open / awaiting user / resolved), last update.
- Ticket thread view: all messages with attachment thumbnails/links, reply box (also supports attachments, same 5 MB limit) unless resolved.

### Admin side

- New admin sidebar item **"Tickets"** (`/app/admin/tickets`), shared across B2B/B2C.
- List with filters (status, category, search) + unread indicator.
- Detail view: submitter name/email/role, category, subject, full threaded conversation with attachments, admin reply box (with attachments), status controls (open / awaiting user / resolved), delete.

### Notifications

- Admin reply or status change → notification for ticket owner.
- User reply → notification for admins (reuses existing `notifications` table + bell).

### Data model (new tables)

```text
support_tickets
  id, user_id, category (feedback|suggestion|issue|other),
  subject, status (open|awaiting_user|resolved),
  last_message_at, created_at, updated_at

support_ticket_messages
  id, ticket_id, author_id, is_admin, body, created_at

support_ticket_attachments
  id, message_id, ticket_id, storage_path, filename,
  content_type, size_bytes, created_at
```

RLS:
- Users: read/insert own tickets + messages + attachments on their tickets.
- Admins: full read/write, status updates, delete.
- GRANTs to `authenticated` + `service_role`.

### Storage

- New private bucket **`support-uploads`** (created via storage tool).
- Path convention: `{ticket_id}/{message_id}/{uuid}-{filename}`.
- RLS on `storage.objects`: user can read/insert files under tickets they own; admins can read/insert/delete all.
- **5 MB per file** enforced in client (pre-upload check), server function (size in metadata row), and a storage policy check on `size_bytes`.

### Server functions (`src/lib/api/support.functions.ts`)

- `createTicket({ category, subject, message, attachments? })` — attachments are `{ path, filename, content_type, size_bytes }[]` already uploaded to storage via signed flow.
- `listMyTickets()` / `getMyTicket({ id })` — returns thread + signed URLs for attachments.
- `replyToTicket({ id, body, attachments? })`
- `adminListTickets({ status?, category?, search? })`
- `adminGetTicket({ id })`
- `adminReplyToTicket({ id, body, attachments? })`
- `adminUpdateTicketStatus({ id, status })`
- `adminDeleteTicket({ id })` — also removes storage objects.

Upload flow: client uploads directly to `support-uploads` bucket using authenticated Supabase client, then passes the resulting paths + sizes into the create/reply server function, which inserts attachment rows after validating size ≤ 5 MB and ownership.

### Files to add

- `supabase/migrations/*_support_tickets.sql`
- `src/lib/api/support.functions.ts`
- `src/routes/app/_authenticated/support.tsx`
- `src/routes/app/_authenticated/admin/tickets.tsx`

### Files to edit

- `src/components/app-sidebar.tsx` — Support on every role menu, Tickets on admin menus.
- `src/components/bottom-nav.tsx` — Support entry where it fits.
- `src/integrations/supabase/types.ts` — regenerated after migration.

### Assumed defaults (tell me if wrong)

- Categories: Feedback / Suggestion / Issue / Other.
- Attachments: images, video, PDF; up to 5 files per message; 5 MB each.
- Shared admin inbox (any admin can respond; no per-admin assignment).
