-- Persist the Marble panorama that ships with every worlds:generate result.

alter table public.worlds
  add column if not exists pano_url text;

create or replace function public.protect_world_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_role() then
    return new;
  end if;
  if new.user_id is distinct from old.user_id
     or new.world_labs_id is distinct from old.world_labs_id
     or new.splat_url is distinct from old.splat_url
     or new.pano_url is distinct from old.pano_url
     or new.repo_url is distinct from old.repo_url
     or new.branch is distinct from old.branch
     or new.marble_url is distinct from old.marble_url then
    raise exception 'world_fields_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop function if exists public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text);

create or replace function public.apply_world_poll_result(
  p_world_id uuid,
  p_done boolean,
  p_progress text default null,
  p_error text default null,
  p_world_labs_id text default null,
  p_splat_url text default null,
  p_thumbnail_url text default null,
  p_caption text default null,
  p_marble_url text default null,
  p_pano_url text default null
)
returns public.worlds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.worlds%rowtype;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row from public.worlds where id = p_world_id for update;
  if not found then
    raise exception 'world_not_found' using errcode = 'P0002';
  end if;

  if v_row.status in ('complete', 'failed') then
    return v_row;
  end if;

  if not coalesce(p_done, false) then
    update public.worlds
    set progress = coalesce(nullif(trim(p_progress), ''), progress),
        pano_url = coalesce(nullif(trim(p_pano_url), ''), pano_url),
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  if p_error is not null and length(trim(p_error)) > 0 then
    update public.worlds
    set status = 'failed',
        progress = trim(p_error),
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  if p_world_labs_id is null or p_splat_url is null then
    update public.worlds
    set status = 'failed',
        progress = 'World Labs finished without assets.',
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  update public.worlds
  set status = 'complete',
      progress = coalesce(nullif(trim(p_progress), ''), 'World ready.'),
      world_labs_id = trim(p_world_labs_id),
      splat_url = trim(p_splat_url),
      thumbnail_url = coalesce(p_thumbnail_url, thumbnail_url),
      caption = coalesce(p_caption, caption),
      marble_url = coalesce(p_marble_url, marble_url),
      pano_url = coalesce(nullif(trim(p_pano_url), ''), pano_url),
      poll_locked_until = null
  where id = p_world_id
  returning * into v_row;

  return v_row;
end;
$$;

drop function if exists public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid);

create or replace function public.publish_world(
  p_repo_url text,
  p_branch text,
  p_repo_name text,
  p_world_labs_id text,
  p_splat_url text,
  p_thumbnail_url text default null,
  p_caption text default null,
  p_marble_url text default null,
  p_is_public boolean default true,
  p_user_id uuid default null,
  p_pano_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_repo_url is null or length(trim(p_repo_url)) = 0 then
    raise exception 'invalid_repo' using errcode = '22023';
  end if;
  if p_world_labs_id is null or p_splat_url is null then
    raise exception 'invalid_world' using errcode = '22023';
  end if;

  v_uid := coalesce(p_user_id, auth.uid());

  insert into public.worlds (
    user_id, repo_url, branch, repo_name, world_labs_id, splat_url,
    thumbnail_url, caption, marble_url, pano_url, is_public
  ) values (
    v_uid, trim(p_repo_url), coalesce(nullif(trim(p_branch), ''), 'main'),
    nullif(trim(p_repo_name), ''), trim(p_world_labs_id), trim(p_splat_url),
    p_thumbnail_url, p_caption, p_marble_url, nullif(trim(p_pano_url), ''),
    coalesce(p_is_public, true)
  )
  on conflict (world_labs_id) do update set
    splat_url = excluded.splat_url,
    thumbnail_url = coalesce(excluded.thumbnail_url, public.worlds.thumbnail_url),
    caption = coalesce(excluded.caption, public.worlds.caption),
    marble_url = coalesce(excluded.marble_url, public.worlds.marble_url),
    pano_url = coalesce(excluded.pano_url, public.worlds.pano_url),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text)
  from public, anon, authenticated;

grant execute on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text)
  to service_role;
grant execute on function public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text)
  to service_role;
