<script lang="ts">
  import { getClientSupabase } from '$lib/supabase-client';
  import { goto } from '$app/navigation';

  const ADMIN_EMAILS = ['rr@methodco.com'];
  const ALL_PERMISSIONS = [
    { key: 'reporting', label: 'Reporting', desc: 'Dashboard, Labor Detail, Insights, Monthly Report' },
    { key: 'planning', label: 'Planning', desc: 'Forecast, Schedule' },
    { key: 'admin', label: 'Admin', desc: 'Settings, Forecast Accuracy, User Management, Add Location' },
    { key: 'insights', label: 'Insights', desc: 'Insights page (granular control)' },
    { key: 'schedule_approval', label: 'Schedule Approval', desc: 'Can approve/deny schedules' },
  ];

  let isAdmin = $state(false);
  let authChecked = $state(false);
  let loading = $state(true);
  let error = $state('');
  let groups = $state<any[]>([]);
  let locations = $state<{ id: string; name: string }[]>([]);

  // Edit group state
  let editingGroupId = $state<string | null>(null);
  let editName = $state('');
  let editDescription = $state('');
  let editPermissions = $state<string[]>([]);

  // Add member state
  let addingToGroupId = $state<string | null>(null);
  let memberEmail = $state('');
  let memberName = $state('');
  let memberLocationIds = $state<string[]>([]);
  let createNewUser = $state(false);
  let newUserPassword = $state('');

  // Create group state
  let showCreateGroup = $state(false);
  let newGroupName = $state('');
  let newGroupDescription = $state('');
  let newGroupPermissions = $state<string[]>([]);

  let saving = $state(false);

  // ---- Init ----
  $effect(() => {
    const supabase = getClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email ?? null;
      isAdmin = !!email && ADMIN_EMAILS.includes(email);
      authChecked = true;
      if (!isAdmin) { goto('/dashboard'); return; }
      loadAll();
    });
  });

  async function loadAll() {
    loading = true;
    error = '';
    try {
      const [grpRes, locRes] = await Promise.all([
        fetch('/api/v1/admin/user-management'),
        fetch('/api/v1/locations'),
      ]);
      if (!grpRes.ok) { error = (await grpRes.json()).error || 'Failed to load groups'; return; }
      const grpData = await grpRes.json();
      groups = grpData.groups || [];
      const locData = await locRes.json();
      locations = locData.locations || [];
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // ---- Actions ----
  async function apiPost(body: Record<string, unknown>) {
    saving = true;
    error = '';
    try {
      const res = await fetch('/api/v1/admin/user-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error || 'Request failed'; return null; }
      return data;
    } catch (e: any) {
      error = e.message;
      return null;
    } finally {
      saving = false;
    }
  }

  function startEditGroup(group: any) {
    editingGroupId = group.id;
    editName = group.name;
    editDescription = group.description || '';
    editPermissions = [...(group.permissions || [])];
  }

  function cancelEditGroup() {
    editingGroupId = null;
  }

  async function saveEditGroup() {
    const result = await apiPost({
      action: 'update_group',
      groupId: editingGroupId,
      name: editName,
      description: editDescription,
      permissions: editPermissions,
    });
    if (result) { editingGroupId = null; await loadAll(); }
  }

  async function deleteGroup(groupId: string, groupName: string) {
    if (!confirm(`Delete group "${groupName}" and all its members?`)) return;
    const result = await apiPost({ action: 'delete_group', groupId });
    if (result) await loadAll();
  }

  function startAddMember(groupId: string) {
    addingToGroupId = groupId;
    memberEmail = '';
    memberName = '';
    memberLocationIds = [];
    createNewUser = false;
    newUserPassword = '';
  }

  function cancelAddMember() {
    addingToGroupId = null;
  }

  async function submitAddMember() {
    if (!addingToGroupId) return;

    if (createNewUser) {
      if (!newUserPassword) { error = 'Password is required when creating a new user'; return; }
      const result = await apiPost({
        action: 'create_user',
        email: memberEmail,
        password: newUserPassword,
        name: memberName,
        groupId: addingToGroupId,
        locationIds: memberLocationIds,
      });
      if (result) { addingToGroupId = null; await loadAll(); }
    } else {
      const result = await apiPost({
        action: 'add_member',
        groupId: addingToGroupId,
        email: memberEmail,
        name: memberName,
        locationIds: memberLocationIds,
      });
      if (result) { addingToGroupId = null; await loadAll(); }
    }
  }

  async function removeMember(memberId: string, memberName: string) {
    if (!confirm(`Remove ${memberName || 'this member'} from the group?`)) return;
    const result = await apiPost({ action: 'remove_member', memberId });
    if (result) await loadAll();
  }

  function startCreateGroup() {
    showCreateGroup = true;
    newGroupName = '';
    newGroupDescription = '';
    newGroupPermissions = [];
  }

  function cancelCreateGroup() {
    showCreateGroup = false;
  }

  async function submitCreateGroup() {
    if (!newGroupName.trim()) { error = 'Group name is required'; return; }
    const result = await apiPost({
      action: 'create_group',
      name: newGroupName.trim(),
      description: newGroupDescription.trim(),
      permissions: newGroupPermissions,
    });
    if (result) { showCreateGroup = false; await loadAll(); }
  }

  function togglePermission(list: string[], perm: string): string[] {
    return list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm];
  }

  function locationName(id: string): string {
    return locations.find((l) => l.id === id)?.name || id.slice(0, 8);
  }
</script>

{#if !authChecked || (!isAdmin && authChecked)}
  <div class="min-h-screen flex items-center justify-center" style="background: #fafafa;">
    <p class="text-sm" style="color: #9ca3af;">
      {authChecked ? 'Access denied. Redirecting...' : 'Checking access...'}
    </p>
  </div>
{:else}
  <div class="p-3 md:p-4">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-xl font-bold" style="color: #1a1a1a;">User Management</h1>
      <p class="text-sm mt-1" style="color: #6b7280;">Manage user groups, permissions, and access</p>
    </div>

    {#if error}
      <div class="mb-4 p-3 rounded-lg text-sm" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;">
        {error}
        <button onclick={() => error = ''} class="ml-2 underline text-xs">dismiss</button>
      </div>
    {/if}

    {#if loading}
      <div class="leo-card p-8 text-center">
        <p class="text-sm" style="color: #9ca3af;">Loading groups...</p>
      </div>
    {:else}
      <!-- Groups -->
      {#each groups as group (group.id)}
        <div class="leo-card mb-4 overflow-hidden">
          <!-- Group Header -->
          <div class="p-4" style="border-bottom: 1px solid #e5e7eb;">
            {#if editingGroupId === group.id}
              <!-- Edit mode -->
              <div class="space-y-3">
                <div class="flex gap-3">
                  <input type="text" bind:value={editName} class="leo-select flex-1" placeholder="Group name" />
                  <input type="text" bind:value={editDescription} class="leo-select flex-1" placeholder="Description" />
                </div>
                <div>
                  <p class="text-xs font-medium mb-2" style="color: #374151;">Permissions</p>
                  <div class="flex flex-wrap gap-2">
                    {#each ALL_PERMISSIONS as perm}
                      <label class="flex items-center gap-1.5 text-xs cursor-pointer select-none px-2 py-1 rounded"
                        style="background: {editPermissions.includes(perm.key) ? '#1e3a5f' : '#f3f4f6'}; color: {editPermissions.includes(perm.key) ? 'white' : '#374151'};">
                        <input type="checkbox" class="sr-only"
                          checked={editPermissions.includes(perm.key)}
                          onchange={() => editPermissions = togglePermission(editPermissions, perm.key)} />
                        {perm.label}
                      </label>
                    {/each}
                  </div>
                </div>
                <div class="flex gap-2">
                  <button class="leo-btn text-xs" onclick={saveEditGroup} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button class="leo-btn-secondary text-xs" onclick={cancelEditGroup}>Cancel</button>
                </div>
              </div>
            {:else}
              <!-- View mode -->
              <div class="flex items-start justify-between">
                <div>
                  <h2 class="text-base font-semibold" style="color: #1a1a1a;">{group.name}</h2>
                  {#if group.description}
                    <p class="text-xs mt-0.5" style="color: #6b7280;">{group.description}</p>
                  {/if}
                  <div class="flex flex-wrap gap-1.5 mt-2">
                    {#each group.permissions as perm}
                      <span class="inline-block px-2 py-0.5 rounded text-[11px] font-medium"
                        style="background: #1e3a5f; color: white;">
                        {perm}
                      </span>
                    {/each}
                  </div>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                  <button class="leo-btn-secondary text-xs" onclick={() => startEditGroup(group)}>Edit</button>
                  <button class="text-xs px-3 py-1.5 rounded" style="color: #dc2626; border: 1px solid #fecaca;"
                    onclick={() => deleteGroup(group.id, group.name)}>Delete</button>
                </div>
              </div>
            {/if}
          </div>

          <!-- Members Table -->
          <div class="overflow-x-auto">
            {#if group.members && group.members.length > 0}
              <table class="w-full">
                <thead>
                  <tr>
                    <th class="leo-th text-left">Name</th>
                    <th class="leo-th text-left">Email</th>
                    <th class="leo-th text-left">Locations</th>
                    <th class="leo-th" style="width: 80px;"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each group.members as member (member.id)}
                    <tr class="hover:bg-[#f8f9fa]">
                      <td class="leo-td text-left">{member.user_name || '-'}</td>
                      <td class="leo-td text-left">{member.user_email}</td>
                      <td class="leo-td text-left">
                        {#if member.location_ids && member.location_ids.length > 0}
                          <div class="flex flex-wrap gap-1">
                            {#each member.location_ids as locId}
                              <span class="inline-block px-1.5 py-0.5 rounded text-[11px]"
                                style="background: #f3f4f6; color: #374151;">
                                {locationName(locId)}
                              </span>
                            {/each}
                          </div>
                        {:else}
                          <span class="text-xs" style="color: #9ca3af;">All locations</span>
                        {/if}
                      </td>
                      <td class="leo-td">
                        <button class="text-xs underline" style="color: #dc2626;"
                          onclick={() => removeMember(member.id, member.user_name)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <div class="p-4 text-center">
                <p class="text-xs" style="color: #9ca3af;">No members in this group</p>
              </div>
            {/if}
          </div>

          <!-- Add Member Form -->
          <div class="p-4" style="border-top: 1px solid #e5e7eb;">
            {#if addingToGroupId === group.id}
              <div class="space-y-3">
                <div class="flex gap-3 flex-wrap">
                  <input type="email" bind:value={memberEmail} class="leo-select" style="min-width: 200px;"
                    placeholder="Email address" />
                  <input type="text" bind:value={memberName} class="leo-select" style="min-width: 160px;"
                    placeholder="Full name" />
                </div>

                <!-- Location multi-select -->
                <div>
                  <p class="text-xs font-medium mb-1.5" style="color: #374151;">Locations</p>
                  <div class="flex flex-wrap gap-2">
                    {#each locations as loc}
                      <label class="flex items-center gap-1.5 text-xs cursor-pointer select-none px-2 py-1 rounded"
                        style="background: {memberLocationIds.includes(loc.id) ? '#1e3a5f' : '#f3f4f6'}; color: {memberLocationIds.includes(loc.id) ? 'white' : '#374151'};">
                        <input type="checkbox" class="sr-only"
                          checked={memberLocationIds.includes(loc.id)}
                          onchange={() => memberLocationIds = togglePermission(memberLocationIds, loc.id)} />
                        {loc.name}
                      </label>
                    {/each}
                  </div>
                </div>

                <!-- Create new user toggle -->
                <div class="flex items-center gap-2">
                  <label class="flex items-center gap-2 text-xs cursor-pointer" style="color: #374151;">
                    <input type="checkbox" bind:checked={createNewUser}
                      class="rounded" style="accent-color: #1e3a5f;" />
                    Create new Supabase auth user (if email doesn't exist yet)
                  </label>
                </div>

                {#if createNewUser}
                  <input type="password" bind:value={newUserPassword} class="leo-select" style="min-width: 200px;"
                    placeholder="Password for new user" />
                {/if}

                <div class="flex gap-2">
                  <button class="leo-btn text-xs" onclick={submitAddMember} disabled={saving || !memberEmail}>
                    {saving ? 'Adding...' : createNewUser ? 'Create User & Add' : 'Add Member'}
                  </button>
                  <button class="leo-btn-secondary text-xs" onclick={cancelAddMember}>Cancel</button>
                </div>
              </div>
            {:else}
              <button class="leo-btn-secondary text-xs" onclick={() => startAddMember(group.id)}>
                + Add Member
              </button>
            {/if}
          </div>
        </div>
      {/each}

      <!-- Create Group -->
      {#if showCreateGroup}
        <div class="leo-card mb-4 p-4">
          <h3 class="text-sm font-semibold mb-3" style="color: #1a1a1a;">Create New Group</h3>
          <div class="space-y-3">
            <div class="flex gap-3">
              <input type="text" bind:value={newGroupName} class="leo-select flex-1" placeholder="Group name" />
              <input type="text" bind:value={newGroupDescription} class="leo-select flex-1" placeholder="Description" />
            </div>
            <div>
              <p class="text-xs font-medium mb-2" style="color: #374151;">Permissions</p>
              <div class="flex flex-wrap gap-2">
                {#each ALL_PERMISSIONS as perm}
                  <label class="flex items-center gap-1.5 text-xs cursor-pointer select-none px-2 py-1 rounded"
                    style="background: {newGroupPermissions.includes(perm.key) ? '#1e3a5f' : '#f3f4f6'}; color: {newGroupPermissions.includes(perm.key) ? 'white' : '#374151'};"
                    title={perm.desc}>
                    <input type="checkbox" class="sr-only"
                      checked={newGroupPermissions.includes(perm.key)}
                      onchange={() => newGroupPermissions = togglePermission(newGroupPermissions, perm.key)} />
                    {perm.label}
                  </label>
                {/each}
              </div>
            </div>
            <div class="flex gap-2">
              <button class="leo-btn text-xs" onclick={submitCreateGroup} disabled={saving || !newGroupName.trim()}>
                {saving ? 'Creating...' : 'Create Group'}
              </button>
              <button class="leo-btn-secondary text-xs" onclick={cancelCreateGroup}>Cancel</button>
            </div>
          </div>
        </div>
      {:else}
        <button class="leo-btn text-sm" onclick={startCreateGroup}>
          + Create New Group
        </button>
      {/if}
    {/if}
  </div>
{/if}
