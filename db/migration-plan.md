# JSON to database migration plan

This project currently stores data in `data/db.json`. The next production step is moving to PostgreSQL or Supabase using `db/schema.sql`.

## Entity mapping

- `recruitments[]` -> `recruitments`
- `threads[]` -> `threads`
- `recruitments[].replies[]` and `threads[].replies[]` -> `replies`
- `recruitments[].likes[]` and `threads[].likes[]` -> `likes`
- `reports[]` -> `reports`
- `messages[]` -> `direct_messages`
- `inquiries[]` -> `inquiries`
- `moderationEvents[]`, `deletedItems[]`, and `auditLogs[]` -> admin history tables

## Migration order

1. Create an admin profile and a fallback imported-user profile.
2. Import recruitments and threads.
3. Import replies with `target_type` and `target_id`.
4. Import likes with `target_type` and `target_id`.
5. Import reports.
6. Import direct messages before validating DM reports.
7. Import inquiries, announcements, ad slots, moderation events, deleted items, and audit logs.
8. Run `npm run postgres:check`.
9. Switch server storage from JSON adapter to database adapter.

## Notes

- Current local account IDs are browser-generated strings. In production they should become real profile IDs from Discord OAuth.
- `inquiries.category` includes `削除依頼`; `resolution_note` stores the operator memo left when an inquiry is resolved.
- Run `db/schema.sql` before importing JSON so inquiry fields such as `request_id`, beta feedback triage fields, and `resolution_note` exist.
- The `likes` table enforces one like per user per target with a unique constraint.
- DM rows preserve hidden status so moderation decisions survive the import.
- `reports.target_type` uses singular values such as `recruitment`, `thread`, `reply`, and `message`.
- Moderation should hide content first instead of hard deleting once real users exist.
- Ad slots are modeled separately so affiliate tags can be managed without code changes.
