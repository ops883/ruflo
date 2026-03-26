import { json, type RequestHandler } from '@sveltejs/kit';
import { getSupabase, getSupabaseService } from '$lib/server/supabase';

// ---------------------------------------------------------------------------
// GET — return all groups with members
// ---------------------------------------------------------------------------
export const GET: RequestHandler = async () => {
  const sb = getSupabase();

  const { data: groups, error: gErr } = await sb
    .from('user_groups')
    .select('*')
    .order('created_at');

  if (gErr) return json({ error: gErr.message }, { status: 500 });

  const { data: members, error: mErr } = await sb
    .from('user_group_members')
    .select('*')
    .order('created_at');

  if (mErr) return json({ error: mErr.message }, { status: 500 });

  const groupsWithMembers = (groups || []).map((g) => ({
    ...g,
    members: (members || []).filter((m) => m.group_id === g.id),
  }));

  return json({ groups: groupsWithMembers });
};

// ---------------------------------------------------------------------------
// POST — actions: create_group, update_group, delete_group,
//                 add_member, remove_member, create_user
// ---------------------------------------------------------------------------
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { action } = body;
  const sb = getSupabase();

  // ---- Create group ----
  if (action === 'create_group') {
    const { name, description, permissions } = body;
    if (!name) return json({ error: 'Name is required' }, { status: 400 });

    const { data, error } = await sb
      .from('user_groups')
      .insert({ name, description: description || null, permissions: permissions || [] })
      .select()
      .single();

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ group: data });
  }

  // ---- Update group ----
  if (action === 'update_group') {
    const { groupId, name, description, permissions } = body;
    if (!groupId) return json({ error: 'groupId is required' }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (permissions !== undefined) update.permissions = permissions;

    const { data, error } = await sb
      .from('user_groups')
      .update(update)
      .eq('id', groupId)
      .select()
      .single();

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ group: data });
  }

  // ---- Delete group ----
  if (action === 'delete_group') {
    const { groupId } = body;
    if (!groupId) return json({ error: 'groupId is required' }, { status: 400 });

    const { error } = await sb.from('user_groups').delete().eq('id', groupId);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true });
  }

  // ---- Add member ----
  if (action === 'add_member') {
    const { groupId, email, name, locationIds } = body;
    if (!groupId || !email) return json({ error: 'groupId and email are required' }, { status: 400 });

    // Look up user by email in auth.users via service role
    const sbService = getSupabaseService();
    const { data: authData } = await sbService.auth.admin.listUsers({ perPage: 1000 });
    const authUser = authData?.users?.find((u) => u.email === email);

    if (!authUser) {
      return json({ error: `No auth user found with email ${email}. Use "Create User" to create one first.` }, { status: 404 });
    }

    const { data, error } = await sb
      .from('user_group_members')
      .insert({
        user_id: authUser.id,
        user_email: email,
        user_name: name || authUser.user_metadata?.full_name || null,
        group_id: groupId,
        location_ids: locationIds || [],
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, { status: 500 });
    return json({ member: data });
  }

  // ---- Remove member ----
  if (action === 'remove_member') {
    const { memberId } = body;
    if (!memberId) return json({ error: 'memberId is required' }, { status: 400 });

    const { error } = await sb.from('user_group_members').delete().eq('id', memberId);
    if (error) return json({ error: error.message }, { status: 500 });
    return json({ ok: true });
  }

  // ---- Create user (Supabase auth + group membership) ----
  if (action === 'create_user') {
    const { email, password, name, groupId, locationIds } = body;
    if (!email || !password) return json({ error: 'email and password are required' }, { status: 400 });

    const sbService = getSupabaseService();

    // Create auth user
    const { data: authData, error: authError } = await sbService.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name || '' },
    });

    if (authError) return json({ error: authError.message }, { status: 500 });
    const newUser = authData.user;

    // Add to group if groupId provided
    if (groupId && newUser) {
      const { error: memError } = await sb
        .from('user_group_members')
        .insert({
          user_id: newUser.id,
          user_email: email,
          user_name: name || null,
          group_id: groupId,
          location_ids: locationIds || [],
        });

      if (memError) {
        return json({ error: `User created but failed to add to group: ${memError.message}` }, { status: 500 });
      }
    }

    return json({ user: { id: newUser?.id, email } });
  }

  return json({ error: `Unknown action: ${action}` }, { status: 400 });
};
