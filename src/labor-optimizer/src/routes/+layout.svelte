<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getClientSupabase } from '$lib/supabase-client';
  import '../app.css';

  let sidebarExpanded = $state(false);
  let mobileMenuOpen = $state(false);
  let userEmail = $state<string | null>(null);
  let authChecked = $state(false);

  const ADMIN_EMAILS = ['rr@methodco.com'];
  let isAdmin = $derived(!!userEmail && ADMIN_EMAILS.includes(userEmail));

  const reportingItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/labor-detail', label: 'Labor Detail' },
    { href: '/dashboard/insights', label: 'Insights' },
    { href: '/dashboard/monthly-report', label: 'Monthly Report' },
  ];

  const planningItems = [
    { href: '/dashboard/forecast', label: 'Forecast' },
    { href: '/dashboard/schedule-approval', label: 'Schedule' },
  ];

  const settingsItems = [
    { href: '/dashboard/admin/user-management', label: 'User Management' },
    { href: '/dashboard/admin/forecast-accuracy', label: 'Forecast Accuracy' },
    { href: '/dashboard/settings', label: 'Settings' },
    { href: '/dashboard/settings/questionnaire', label: 'Labor Questionnaire' },
    { href: '/dashboard/admin/principles', label: 'Principles' },
    { href: '/setup', label: 'Add Location' },
  ];

  const allNavItems = [...reportingItems, ...planningItems, ...settingsItems];

  onMount(() => {
    const supabase = getClientSupabase();

    supabase.auth.getSession().then(({ data: { session } }) => {
      userEmail = session?.user?.email ?? null;
      authChecked = true;
      if (!session && !isLoginPage()) {
        goto('/login');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      userEmail = session?.user?.email ?? null;
      if (!session && !isLoginPage()) {
        goto('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  });

  function isLoginPage(): boolean {
    return $page.url.pathname === '/login';
  }

  async function handleLogout() {
    const supabase = getClientSupabase();
    await supabase.auth.signOut();
    goto('/login');
  }
</script>

{#if !authChecked}
  <!-- Auth check in progress -->
  <div class="min-h-screen flex items-center justify-center" style="background: #fafafa;">
    <p class="text-sm text-[#9ca3af]">Loading...</p>
  </div>
{:else if isLoginPage()}
  <!-- Login page renders without sidebar -->
  <slot />
{:else if !userEmail}
  <!-- Not authenticated, will redirect -->
  <div class="min-h-screen flex items-center justify-center" style="background: #fafafa;">
    <p class="text-sm text-[#9ca3af]">Redirecting to login...</p>
  </div>
{:else}
  <!-- Mobile Header -->
  <div class="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4" style="height: 52px; background: #0e0e0e;">
    <button onclick={() => mobileMenuOpen = !mobileMenuOpen}
      class="flex items-center justify-center w-10 h-10 rounded-lg"
      style="color: white; background: rgba(255,255,255,0.08); min-height: 44px; min-width: 44px;"
      aria-label="Toggle menu">
      {#if mobileMenuOpen}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      {/if}
    </button>
    <a href="/dashboard" class="text-white font-bold text-sm tracking-wide">HELIXO</a>
    <span class="w-10"></span>
  </div>

  <!-- Mobile Overlay -->
  {#if mobileMenuOpen}
    <div class="md:hidden fixed inset-0 z-30" style="background: rgba(0,0,0,0.5);" onclick={() => mobileMenuOpen = false} role="presentation"></div>
  {/if}

  <!-- Mobile Slide-in Nav -->
  <div class="md:hidden fixed top-[52px] left-0 bottom-0 z-30 flex flex-col py-4 overflow-y-auto transition-transform duration-200"
    style="width: 240px; background: #1a1a1a; transform: {mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)'};">
    <div class="px-4 mb-1">
      <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">REPORTING</span>
    </div>
    {#each reportingItems as item}
      <a href={item.href} onclick={() => mobileMenuOpen = false}
        class="block px-4 py-3 text-sm transition-colors"
        style="{$page.url.pathname === item.href
          ? 'color: white; background: rgba(255,255,255,0.08); font-weight: 500;'
          : 'color: rgba(255,255,255,0.55);'}; min-height: 44px; display: flex; align-items: center;">
        {item.label}
      </a>
    {/each}

    <div class="px-4 mb-1 mt-4">
      <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">PLANNING</span>
    </div>
    {#each planningItems as item}
      <a href={item.href} onclick={() => mobileMenuOpen = false}
        class="block px-4 py-3 text-sm transition-colors"
        style="{$page.url.pathname === item.href
          ? 'color: white; background: rgba(255,255,255,0.08); font-weight: 500;'
          : 'color: rgba(255,255,255,0.55);'}; min-height: 44px; display: flex; align-items: center;">
        {item.label}
      </a>
    {/each}

    {#if isAdmin}
      <div class="px-4 mb-1 mt-4">
        <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">ADMIN</span>
      </div>
      {#each settingsItems as item}
        <a href={item.href} onclick={() => mobileMenuOpen = false}
          class="block px-4 py-3 text-sm transition-colors"
          style="{$page.url.pathname === item.href
            ? 'color: white; background: rgba(255,255,255,0.08); font-weight: 500;'
            : 'color: rgba(255,255,255,0.55);'}; min-height: 44px; display: flex; align-items: center;">
          {item.label}
        </a>
      {/each}
    {/if}

    <div class="mt-auto px-4 pt-4 border-t" style="border-color: rgba(255,255,255,0.1);">
      <p class="text-xs truncate mb-2" style="color: rgba(255,255,255,0.5);" title={userEmail}>{userEmail}</p>
      <button onclick={handleLogout} class="text-xs transition-colors py-2" style="color: rgba(255,255,255,0.4); min-height: 44px;">
        Sign Out
      </button>
    </div>
  </div>

  <div class="min-h-screen flex" style="background: #fafafa;">
    <!-- Desktop Icon Rail -->
    <div class="hidden md:flex flex-col items-center py-4 gap-1 flex-shrink-0" style="width: 56px; background: #0e0e0e;">
      <a href="/dashboard" class="flex items-center justify-center w-10 h-10 rounded-lg mb-4" style="background: rgba(255,255,255,0.08);">
        <span class="text-white font-bold text-sm">H</span>
      </a>

      <button onclick={() => sidebarExpanded = !sidebarExpanded}
        class="flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs transition-colors"
        style="{reportingItems.some(i => $page.url.pathname === i.href) ? 'background: rgba(30,58,95,0.8); color: white;' : 'color: rgba(255,255,255,0.5);'}"
        title="Reporting">
        <span class="text-sm font-semibold">R</span>
      </button>
      <span class="text-[9px] uppercase tracking-wider mb-2" style="color: rgba(255,255,255,0.35);">REPORT</span>

      <button onclick={() => sidebarExpanded = !sidebarExpanded}
        class="flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs transition-colors"
        style="{planningItems.some(i => $page.url.pathname === i.href) ? 'background: rgba(30,58,95,0.8); color: white;' : 'color: rgba(255,255,255,0.5);'}"
        title="Planning">
        <span class="text-sm font-semibold">P</span>
      </button>
      <span class="text-[9px] uppercase tracking-wider mb-2" style="color: rgba(255,255,255,0.35);">PLAN</span>

      {#if isAdmin}
        <button onclick={() => sidebarExpanded = !sidebarExpanded}
          class="flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs transition-colors"
          style="{settingsItems.some(i => $page.url.pathname === i.href) ? 'background: rgba(30,58,95,0.8); color: white;' : 'color: rgba(255,255,255,0.5);'}"
          title="Admin">
          <span class="text-sm font-semibold">A</span>
        </button>
        <span class="text-[9px] uppercase tracking-wider mb-2" style="color: rgba(255,255,255,0.35);">ADMIN</span>
      {/if}
    </div>

    <!-- Desktop Expandable Nav Panel -->
    {#if sidebarExpanded}
      <div class="hidden md:flex flex-col flex-shrink-0 py-4 overflow-y-auto" style="width: 180px; background: #1a1a1a;">
        <div class="flex items-center justify-between px-4 mb-4">
          <span class="text-white font-bold text-base tracking-wide">HELIXO</span>
          <button onclick={() => sidebarExpanded = false} class="text-xs cursor-pointer" style="color: rgba(255,255,255,0.4);">
            &#8249;
          </button>
        </div>

        <div class="px-4 mb-1">
          <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">REPORTING</span>
        </div>
        {#each reportingItems as item}
          <a href={item.href}
            class="block px-4 py-2 text-sm transition-colors"
            style="{$page.url.pathname === item.href
              ? 'color: white; background: rgba(255,255,255,0.08); font-weight: 500;'
              : 'color: rgba(255,255,255,0.55);'}">
            {item.label}
          </a>
        {/each}

        <div class="px-4 mb-1 mt-4">
          <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">PLANNING</span>
        </div>
        {#each planningItems as item}
          <a href={item.href}
            class="block px-4 py-2 text-sm transition-colors"
            style="{$page.url.pathname === item.href
              ? 'color: white; background: rgba(255,255,255,0.08); font-weight: 500;'
              : 'color: rgba(255,255,255,0.55);'}">
            {item.label}
          </a>
        {/each}

        {#if isAdmin}
          <div class="px-4 mb-1 mt-4">
            <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">ADMIN</span>
          </div>
          {#each settingsItems as item}
            <a href={item.href}
              class="block px-4 py-2 text-sm transition-colors"
              style="{$page.url.pathname === item.href
                ? 'color: white; background: rgba(255,255,255,0.08); font-weight: 500;'
                : 'color: rgba(255,255,255,0.55);'}">
              {item.label}
            </a>
          {/each}
        {/if}

        <div class="mt-auto px-4 pt-4 border-t" style="border-color: rgba(255,255,255,0.1);">
          <p class="text-xs truncate mb-2" style="color: rgba(255,255,255,0.5);" title={userEmail}>{userEmail}</p>
          <button onclick={handleLogout} class="text-xs transition-colors" style="color: rgba(255,255,255,0.4);" onmouseenter={(e) => e.currentTarget.style.color = '#fff'} onmouseleave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>
            Sign Out
          </button>
        </div>
      </div>
    {/if}

    <!-- Main Content -->
    <div class="flex-1 min-w-0 overflow-auto pt-[52px] md:pt-0">
      <slot />
    </div>
  </div>
{/if}
