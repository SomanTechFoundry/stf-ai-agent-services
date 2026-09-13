# Backup and restore

Customer bookings live in Neon PostgreSQL. Treat that as the source of truth.

## What Neon already does

- Production Neon projects keep **point-in-time restore** (typically several days).
- You can branch the database from a timestamp if a bad write happens.
- Use the **direct** connection (`DIRECT_URL`) for `pg_dump` / restore, not the pooled URL.

## Daily habit for the salon

1. In the dashboard, open **Appointments**.
2. Set the date range (this week is enough).
3. Click **Export CSV**.
4. Keep the file with the salon’s other records.

The CSV is enough to rebuild a week of bookings by hand if needed. It is not a full database dump.

## Operator restore (you)

1. Open the Neon console → the project used by this environment.
2. Restore a branch from the time just before the problem, **or** restore from a `pg_dump` you took with `DIRECT_URL`.
3. Point `DATABASE_URL` / `DIRECT_URL` at the restored database (or promote that branch).
4. Do **not** restore OAuth tokens or session cookies from a random backup into production unless you also rotate `API_SECRET_KEY` and reconnect Google Calendar.

```bash
pg_dump "$DIRECT_URL" --no-owner --format=custom --file=stf-$(date +%Y%m%d).dump
```

## After a restore

- Owners should **Export CSV** again and spot-check today’s appointments.
- If Google Calendar was connected, disconnect and reconnect so tokens match the restored row.
- Confirm chat still books against the restored data.
