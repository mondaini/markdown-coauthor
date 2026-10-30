-- Append-only log of Yjs updates per shared document.
-- Yjs updates merge in any order, so concurrent writers never overwrite each other.
-- ponytail: no compaction; load time grows with edit history. Add a route that merges a
-- document's rows into one and deletes the rest when that starts to matter.
create table if not exists public.doc_updates (
  id bigserial primary key,
  doc_id text not null check (doc_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  update text not null check (octet_length(update) < 350000), -- base64 Yjs update
  created_at timestamptz not null default now()
);

create index if not exists doc_updates_doc_id_id on public.doc_updates (doc_id, id);

alter table public.doc_updates enable row level security;

-- The public key ships in the browser, so a select policy would let anyone list every
-- document. Instead there is no select policy at all: rows are readable only through
-- doc_updates_for(), which needs the document's unguessable id.
drop policy if exists "read doc updates" on public.doc_updates;
-- Supabase's defaults grant every table privilege to the public roles. RLS covers update and
-- delete, but not truncate, so keep only what the app needs: insert.
revoke all on public.doc_updates from anon, authenticated;
grant insert on public.doc_updates to anon, authenticated;
grant usage on sequence public.doc_updates_id_seq to anon, authenticated;

-- Anyone with the link can append. Nobody can read in bulk, rewrite or delete history.
drop policy if exists "append doc updates" on public.doc_updates;
create policy "append doc updates" on public.doc_updates
  for insert to anon, authenticated with check (true);

create or replace function public.doc_updates_for(p_doc_id text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select u.update from public.doc_updates u where u.doc_id = p_doc_id order by u.id;
$$;

revoke all on function public.doc_updates_for(text) from public;
grant execute on function public.doc_updates_for(text) to anon, authenticated;
