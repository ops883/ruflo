<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getClientSupabase } from '$lib/supabase-client';
  import {
    type UserRole,
    type RolePermissions,
    type TabPermissions,
    ROLE_PERMISSIONS,
    EMPTY_TAB_PERMISSIONS,
  } from '$lib/roles';
  import '../app.css';

  let sidebarExpanded = $state(false);
  let mobileMenuOpen = $state(false);
  let userEmail = $state<string | null>(null);
  let authChecked = $state(false);
  let mustChangePassword = $state(false);
  let userRole = $state<UserRole>('viewer');
  let userPermissions = $state<RolePermissions>(ROLE_PERMISSIONS.viewer);
  let tabPermissions = $state<TabPermissions>(EMPTY_TAB_PERMISSIONS);

  // Module-level cache to avoid re-fetching on every navigation
  let cachedRoleEmail: string | null = null;
  let cachedRole: UserRole | null = null;
  let cachedPermissions: RolePermissions | null = null;
  let cachedTabPermissions: TabPermissions | null = null;

  // Nav items derived from tabPermissions
  let reportingItems = $derived(buildReportingItems(tabPermissions));
  let planningItems = $derived(buildPlanningItems(tabPermissions));
  let executiveItems = $derived(buildExecutiveItems(tabPermissions));
  let adminItems = $derived(buildAdminItems(tabPermissions));

  let hasReporting = $derived(reportingItems.length > 0);
  let hasPlanning = $derived(planningItems.length > 0);
  let hasExecutive = $derived(executiveItems.length > 0);
  let isAdmin = $derived(adminItems.length > 0);

  let allNavItems = $derived([...reportingItems, ...planningItems, ...executiveItems, ...adminItems]);

  function buildReportingItems(tp: TabPermissions): { href: string; label: string }[] {
    const items: { href: string; label: string }[] = [];
    if (tp.reporting.includes('dashboard')) items.push({ href: '/dashboard', label: 'Dashboard' });
    if (tp.reporting.includes('labor_detail')) items.push({ href: '/dashboard/labor-detail', label: 'Labor Detail' });
    if (tp.reporting.includes('insights')) items.push({ href: '/dashboard/insights', label: 'Insights' });
    return items;
  }

  function buildExecutiveItems(tp: TabPermissions): { href: string; label: string }[] {
    const items: { href: string; label: string }[] = [];
    if (tp.reporting.includes('executive_summary')) items.push({ href: '/dashboard/executive', label: 'Executive Summary' });
    if (tp.reporting.includes('location_comparison')) items.push({ href: '/dashboard/location-comparison', label: 'Location Comparison' });
    return items;
  }

  function buildPlanningItems(tp: TabPermissions): { href: string; label: string }[] {
    const items: { href: string; label: string }[] = [];
    if (tp.planning.includes('forecast')) items.push({ href: '/dashboard/forecast', label: 'Forecast' });
    if (tp.planning.includes('staffing')) items.push({ href: '/dashboard/staffing', label: 'Staffing' });
    if (tp.planning.includes('schedule_builder')) items.push({ href: '/dashboard/schedule-builder', label: 'Schedule Builder' });
    if (tp.planning.includes('schedule_approval')) items.push({ href: '/dashboard/schedule-approval', label: 'Schedule' });
    return items;
  }

  function buildAdminItems(tp: TabPermissions): { href: string; label: string }[] {
    const items: { href: string; label: string }[] = [];
    if (tp.admin.includes('user_management')) items.push({ href: '/dashboard/admin/user-management', label: 'User Management' });
    if (tp.admin.includes('employees')) items.push({ href: '/dashboard/admin/employees', label: 'Employees' });
    if (tp.admin.includes('forecast_accuracy')) items.push({ href: '/dashboard/admin/forecast-accuracy', label: 'Forecast Accuracy' });
    if (tp.admin.includes('engine_audit')) items.push({ href: '/dashboard/admin/engine-audit', label: 'Engine Audit' });
    if (tp.admin.includes('competitive_set')) items.push({ href: '/dashboard/admin/competitive', label: 'Competitive Set' });
    if (tp.admin.includes('settings')) items.push({ href: '/dashboard/settings', label: 'Settings' });
    if (tp.admin.includes('labor_questionnaire')) items.push({ href: '/dashboard/settings/questionnaire', label: 'Labor Questionnaire' });
    if (tp.admin.includes('guiding_principles')) items.push({ href: '/dashboard/admin/principles', label: 'Guiding Principles' });
    if (tp.admin.includes('data_sources')) items.push({ href: '/dashboard/admin/data-source-map', label: 'Data Sources' });
    return items;
  }

  async function fetchUserRole(email: string) {
    if (cachedRoleEmail === email && cachedRole !== null) {
      userRole = cachedRole;
      userPermissions = cachedPermissions || ROLE_PERMISSIONS.viewer;
      tabPermissions = cachedTabPermissions || EMPTY_TAB_PERMISSIONS;
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`/api/v1/auth/role?email=${encodeURIComponent(email)}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        userRole = data.role || 'viewer';
        userPermissions = data.permissions || ROLE_PERMISSIONS.viewer;
        tabPermissions = data.tabPermissions || EMPTY_TAB_PERMISSIONS;
        cachedRoleEmail = email;
        cachedRole = userRole;
        cachedPermissions = userPermissions;
        cachedTabPermissions = tabPermissions;
      }
    } catch {
      userRole = 'viewer';
      userPermissions = ROLE_PERMISSIONS.viewer;
      tabPermissions = EMPTY_TAB_PERMISSIONS;
    }
  }

  onMount(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) reg.unregister();
      });
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) caches.delete(name);
        });
      }
    }

    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      document.body.classList.add('native-app');
      import('$lib/push-notifications').then((m) => m.initPushNotifications());
    }

    const supabase = getClientSupabase();

    // Hard fallback: if auth check takes too long, show the page anyway
    // This prevents infinite "Loading..." on slow network or Supabase cold starts
    const authTimeout = setTimeout(() => {
      if (!authChecked) {
        console.warn('[Layout] Auth check timed out after 3s — showing page');
        authChecked = true;
      }
    }, 3000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        userEmail = session?.user?.email ?? null;
        if (userEmail) {
          await Promise.race([
            (async () => {
              await fetchUserRole(userEmail!);
              await checkMustChangePassword(userEmail!);
            })(),
            new Promise(resolve => setTimeout(resolve, 3000))
          ]);
        }
        if (!session && !isPublicPage()) {
          goto('/login');
        }
      } catch (e) {
        console.error('Auth init error:', e);
      } finally {
        clearTimeout(authTimeout);
        authChecked = true;
      }
    }).catch(() => { clearTimeout(authTimeout); authChecked = true; });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      userEmail = session?.user?.email ?? null;
      if (userEmail) {
        // Clear cache on auth state change so we get fresh permissions
        cachedRoleEmail = null;
        cachedRole = null;
        cachedPermissions = null;
        cachedTabPermissions = null;
        await fetchUserRole(userEmail);
        await checkMustChangePassword(userEmail);
      } else {
        userRole = 'viewer';
        userPermissions = ROLE_PERMISSIONS.viewer;
        tabPermissions = EMPTY_TAB_PERMISSIONS;
        mustChangePassword = false;
      }
      if (!session && !isPublicPage()) {
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

  function isChangePasswordPage(): boolean {
    return $page.url.pathname === '/change-password';
  }

  function isPublicPage(): boolean {
    return isLoginPage() || isChangePasswordPage();
  }

  async function checkMustChangePassword(email: string) {
    try {
      const supabase = getClientSupabase();
      const { data } = await supabase
        .from('location_users')
        .select('must_change_password')
        .eq('user_email', email)
        .limit(1)
        .maybeSingle();

      mustChangePassword = data?.must_change_password === true;
      if (mustChangePassword && !isChangePasswordPage()) {
        goto('/change-password');
      }
    } catch {
      mustChangePassword = false;
    }
  }

  async function handleLogout() {
    try {
      const supabase = getClientSupabase();
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[Layout] Sign out error:', e);
    } finally {
      window.location.href = '/login';
    }
  }
</script>

{#if !authChecked}
  <div class="min-h-screen flex items-center justify-center" style="background: #fafafa;">
    <p class="text-sm text-[#9ca3af]">Loading...</p>
  </div>
{:else if isLoginPage() || isChangePasswordPage()}
  <slot />
{:else if !userEmail}
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

    {#if reportingItems.length > 0}
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
    {/if}

    {#if planningItems.length > 0}
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
    {/if}

    {#if executiveItems.length > 0}
      <div class="px-4 mb-1 mt-4">
        <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">EXECUTIVE REPORTING</span>
      </div>
      {#each executiveItems as item}
        <a href={item.href} onclick={() => mobileMenuOpen = false}
          class="block px-4 py-3 text-sm transition-colors"
          style="{$page.url.pathname === item.href
            ? 'color: white; background: rgba(255,255,255,0.08); font-weight: 500;'
            : 'color: rgba(255,255,255,0.55);'}; min-height: 44px; display: flex; align-items: center;">
          {item.label}
        </a>
      {/each}
    {/if}

    {#if adminItems.length > 0}
      <div class="px-4 mb-1 mt-4">
        <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">ADMIN</span>
      </div>
      {#each adminItems as item}
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
      <span class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded" style="background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5);">{userRole.replace('_', ' ')}</span>
      <button onclick={handleLogout} class="text-xs transition-colors py-2 mt-1" style="color: rgba(255,255,255,0.4); min-height: 44px;">
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

      {#if hasReporting}
        <button onclick={() => sidebarExpanded = !sidebarExpanded}
          class="flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs transition-colors"
          style="{reportingItems.some(i => $page.url.pathname === i.href) ? 'background: rgba(30,58,95,0.8); color: white;' : 'color: rgba(255,255,255,0.5);'}"
          title="Reporting">
          <span class="text-sm font-semibold">R</span>
        </button>
        <span class="text-[9px] uppercase tracking-wider mb-2" style="color: rgba(255,255,255,0.35);">REPORT</span>
      {/if}

      {#if hasPlanning}
        <button onclick={() => sidebarExpanded = !sidebarExpanded}
          class="flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs transition-colors"
          style="{planningItems.some(i => $page.url.pathname === i.href) ? 'background: rgba(30,58,95,0.8); color: white;' : 'color: rgba(255,255,255,0.5);'}"
          title="Planning">
          <span class="text-sm font-semibold">P</span>
        </button>
        <span class="text-[9px] uppercase tracking-wider mb-2" style="color: rgba(255,255,255,0.35);">PLAN</span>
      {/if}

      {#if hasExecutive}
        <button onclick={() => sidebarExpanded = !sidebarExpanded}
          class="flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs transition-colors"
          style="{executiveItems.some(i => $page.url.pathname === i.href) ? 'background: rgba(30,58,95,0.8); color: white;' : 'color: rgba(255,255,255,0.5);'}"
          title="Executive Reporting">
          <span class="text-sm font-semibold">E</span>
        </button>
        <span class="text-[9px] uppercase tracking-wider mb-2" style="color: rgba(255,255,255,0.35);">EXEC</span>
      {/if}

      {#if isAdmin}
        <button onclick={() => sidebarExpanded = !sidebarExpanded}
          class="flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs transition-colors"
          style="{adminItems.some(i => $page.url.pathname === i.href) ? 'background: rgba(30,58,95,0.8); color: white;' : 'color: rgba(255,255,255,0.5);'}"
          title="Admin">
          <span class="text-sm font-semibold">A</span>
        </button>
        <span class="text-[9px] uppercase tracking-wider mb-2" style="color: rgba(255,255,255,0.35);">ADMIN</span>
      {/if}
      <!-- Sign out at bottom of icon rail -->
      <div class="mt-auto">
        <button onclick={handleLogout}
          class="flex flex-col items-center justify-center w-10 h-10 rounded-lg text-xs transition-colors"
          style="color: rgba(255,255,255,0.4);"
          onmouseenter={(e) => e.currentTarget.style.color = '#fff'}
          onmouseleave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
          title="Sign Out">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
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

        {#if reportingItems.length > 0}
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
        {/if}

        {#if planningItems.length > 0}
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
        {/if}

        {#if executiveItems.length > 0}
          <div class="px-4 mb-1 mt-4">
            <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">EXECUTIVE REPORTING</span>
          </div>
          {#each executiveItems as item}
            <a href={item.href}
              class="block px-4 py-2 text-sm transition-colors"
              style="{$page.url.pathname === item.href
                ? 'color: white; background: rgba(255,255,255,0.08); font-weight: 500;'
                : 'color: rgba(255,255,255,0.55);'}">
              {item.label}
            </a>
          {/each}
        {/if}

        {#if adminItems.length > 0}
          <div class="px-4 mb-1 mt-4">
            <span class="text-[10px] uppercase tracking-widest font-semibold" style="color: #5b8cbf;">ADMIN</span>
          </div>
          {#each adminItems as item}
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
          <span class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded" style="background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5);">{userRole.replace('_', ' ')}</span>
          <button onclick={handleLogout} class="text-xs transition-colors mt-1" style="color: rgba(255,255,255,0.4);" onmouseenter={(e) => e.currentTarget.style.color = '#fff'} onmouseleave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>
            Sign Out
          </button>
        </div>
      </div>
    {/if}

    <!-- Main Content -->
    <div class="flex-1 min-w-0 overflow-auto pt-[52px] md:pt-0 px-[5%] md:px-[7%]">
      <slot />
    </div>
  </div>
{/if}
