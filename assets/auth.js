function initializePanelStudioAuth() {
  const $ = (selector) => document.querySelector(selector);
  const studioShell = $('#studioShell');
  const isEditorPage = Boolean(studioShell);
  const form = $('#authForm');
  const submit = $('#authSubmit');
  const setupNotice = $('#authSetup');
  const message = $('#authMessage');
  const loadingNotice = $('#authLoading');
  const signInTab = $('#signInTab');
  const signUpTab = $('#signUpTab');
  let mode = 'signin';
  let passwordRecovery = false;
  let bootPromise = null;
  let client = null;
  const queuedProjects = new Map();
  let queueTimer = null;
  let syncChain = Promise.resolve();

  function hideLoadingNotice() {
    if (loadingNotice) loadingNotice.hidden = true;
  }

  function showMessage(text, kind = 'error') {
    if (!message) {
      console.warn(text);
      return;
    }
    message.textContent = text;
    message.className = `auth-message${kind === 'success' ? ' success' : ''}`;
    message.hidden = false;
  }

  function clearMessage() {
    if (!message) return;
    message.textContent = '';
    message.hidden = true;
  }

  function setMode(nextMode) {
    if (isEditorPage) return;
    mode = nextMode;
    const creating = mode === 'signup';
    const recovery = mode === 'reset';
    signInTab.classList.toggle('active', !creating);
    signUpTab.classList.toggle('active', creating);
    signInTab.setAttribute('aria-selected', String(!creating));
    signUpTab.setAttribute('aria-selected', String(creating));
    $('.auth-tabs').hidden = recovery;
    $('#nameField').hidden = !creating;
    $('#usernameField').hidden = !creating;
    $('#emailField').hidden = recovery;
    $('#emailField').querySelector('label').textContent = creating ? 'E-mail' : 'E-mail ou nome de login';
    $('#authEmail').type = creating || recovery ? 'email' : 'text';
    $('#authEmail').placeholder = creating ? 'voce@empresa.com' : 'voce@empresa.com ou usuario';
    $('#authTitle').textContent = recovery ? 'Defina uma nova senha' : creating ? 'Crie seu perfil' : 'Boas-vindas de volta';
    $('#authSubtitle').textContent = recovery ? 'Escolha uma senha nova para sua conta.' : creating
      ? 'Seus projetos ficarão organizados na sua conta.'
      : 'Entre na sua conta para acessar seus projetos.';
    $('#passwordLabel').textContent = recovery ? 'Nova senha' : 'Senha';
    $('#authPassword').autocomplete = creating || recovery ? 'new-password' : 'current-password';
    $('#authPassword').placeholder = recovery ? 'Digite sua nova senha' : 'Digite sua senha';
    $('#passwordHint').textContent = creating || recovery ? 'Use pelo menos 8 caracteres.' : 'Use sua senha do Painel Studio.';
    $('#forgotPassword').hidden = creating || recovery;
    submit.querySelector('span:first-child').textContent = recovery ? 'Salvar nova senha' : creating ? 'Criar conta' : 'Entrar';
    clearMessage();
  }

  function setBusy(busy) {
    if (!submit) return;
    submit.disabled = busy;
    submit.querySelector('span:first-child').textContent = busy
      ? (mode === 'signup' ? 'Criando conta…' : mode === 'reset' ? 'Salvando…' : 'Entrando…')
      : (mode === 'signup' ? 'Criar conta' : mode === 'reset' ? 'Salvar nova senha' : 'Entrar');
  }

  function makeStorageKeys(userId) {
    return {
      draft: `painel-studio-v1:${userId}`,
      projects: `painel-studio-projects-v1:${userId}`,
      active: `painel-studio-active-project:${userId}`,
      draftName: `painel-studio-draft-name:${userId}`,
      collapsedLibrary: `painel-studio-collapsed-library-categories:${userId}`
    };
  }

  function readCachedProjects(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed.filter((project) => project?.id && project?.data) : [];
    } catch {
      return [];
    }
  }

  function toProject(row) {
    return { id: row.id, name: row.name, data: row.data, updatedAt: row.updated_at };
  }

  async function writeProject(project) {
    const { error } = await client.from('projects').upsert({
      id: project.id,
      name: project.name,
      data: project.data,
      updated_at: project.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) throw error;
  }

  function queueProjectSync(project) {
    if (!client || !project?.id || !project?.data) return;
    queuedProjects.set(project.id, JSON.parse(JSON.stringify(project)));
    clearTimeout(queueTimer);
    queueTimer = setTimeout(() => {
      void flushProjectSync().catch((error) => {
        const saveState = $('#saveState');
        if (saveState) saveState.textContent = 'Erro ao sincronizar';
        console.warn('Falha ao sincronizar alterações do projeto.', error);
      });
    }, 900);
  }

  async function flushProjectSync() {
    clearTimeout(queueTimer);
    queueTimer = null;
    if (!queuedProjects.size) return syncChain;
    const batch = [...queuedProjects.values()];
    queuedProjects.clear();
    syncChain = syncChain.catch(() => {}).then(async () => {
      for (const project of batch) await writeProject(project);
      const activeId = localStorage.getItem(window.PANEL_STUDIO_KEYS?.active);
      const saveState = $('#saveState');
      if (saveState && batch.some((project) => project.id === activeId)) saveState.textContent = 'Sincronizado';
    });
    await syncChain;
  }

  window.PANEL_STUDIO_SYNC_PROJECT = async (project) => {
    if (!project?.id || !project?.data) return;
    queuedProjects.set(project.id, JSON.parse(JSON.stringify(project)));
    await flushProjectSync();
  };
  window.PANEL_STUDIO_DELETE_PROJECT = async (id) => {
    const { error } = await client.from('projects').delete().eq('id', id);
    if (error) throw error;
  };
  window.PANEL_STUDIO_QUEUE_PROJECT_SYNC = queueProjectSync;
  window.PANEL_STUDIO_FLUSH_SYNC = flushProjectSync;
  window.PANEL_STUDIO_STORAGE_KEYS = makeStorageKeys;

  async function loadAndCacheProjects(user, keys) {
    const { data, error } = await client.from('projects')
      .select('id,name,data,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const remoteProjects = (data || []).map(toProject);
    const remoteById = new Map(remoteProjects.map((project) => [project.id, project]));
    const cachedProjects = readCachedProjects(keys.projects);
    for (const cached of cachedProjects) {
      const remote = remoteById.get(cached.id);
      if (!remote || String(cached.updatedAt || '') > String(remote.updatedAt || '')) {
        await writeProject(cached);
        remoteById.set(cached.id, cached);
      }
    }
    const merged = [...remoteById.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    localStorage.setItem(keys.projects, JSON.stringify(merged));
    return merged;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${src}?v=0.3.6`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
      document.body.append(script);
    });
  }

  function addProfileControls(user) {
    const header = $('.topbar');
    if (!header) return;
    const displayName = user.user_metadata?.full_name?.trim() || 'Não informado';
    const account = document.createElement('div');
    account.className = 'profile-account';

    const trigger = document.createElement('button');
    trigger.className = 'btn profile-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', `Conta de ${user.email || 'usuário'}`);
    trigger.innerHTML = '<span class="profile-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.5 20c.5-3.5 2.8-5.4 6.5-5.4s6 1.9 6.5 5.4"></path></svg></span><span class="profile-chevron" aria-hidden="true">⌄</span>';

    const menu = document.createElement('div');
    menu.className = 'profile-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Opções da conta');
    menu.hidden = true;
    const menuIdentity = document.createElement('div');
    menuIdentity.className = 'profile-menu-identity';
    const identityName = document.createElement('strong');
    identityName.textContent = displayName;
    const identityEmail = document.createElement('span');
    identityEmail.textContent = user.email || '';
    menuIdentity.append(identityName, identityEmail);

    const profileButton = document.createElement('button');
    profileButton.className = 'profile-menu-item';
    profileButton.type = 'button';
    profileButton.setAttribute('role', 'menuitem');
    profileButton.textContent = 'Ver perfil';

    const signOut = document.createElement('button');
    signOut.className = 'profile-menu-item profile-menu-logout';
    signOut.type = 'button';
    signOut.textContent = 'Sair';
    signOut.setAttribute('role', 'menuitem');

    let manageUsers = null;
    let usersBackdrop = null;
    if (window.PANEL_STUDIO_IS_ADMIN) {
      manageUsers = document.createElement('button');
      manageUsers.className = 'profile-menu-item';
      manageUsers.type = 'button';
      manageUsers.setAttribute('role', 'menuitem');
      manageUsers.textContent = 'Gerenciar usuários';

      usersBackdrop = document.createElement('div');
      usersBackdrop.className = 'profile-modal-backdrop';
      usersBackdrop.id = 'adminUsersModal';
      usersBackdrop.hidden = true;
      usersBackdrop.innerHTML = '<section class="profile-dialog admin-users-dialog" role="dialog" aria-modal="true" aria-labelledby="adminUsersTitle" tabindex="-1"><div class="profile-dialog-heading"><div><span class="profile-dialog-eyebrow">ADMINISTRAÇÃO</span><h2 id="adminUsersTitle">Usuários</h2></div><button class="profile-dialog-close" type="button" aria-label="Fechar usuários">×</button></div><p class="admin-users-hint">Selecione uma conta para ver os projetos salvos. Admins podem abrir projetos de qualquer perfil.</p><div class="admin-users-list" aria-live="polite">Carregando usuários…</div><section class="admin-user-projects" hidden aria-label="Projetos do usuário"><button class="btn admin-users-back" type="button">← Usuários</button><h3 class="admin-user-projects-title"></h3><div class="admin-user-project-list" aria-live="polite"></div></section><p class="admin-users-status" role="status" hidden></p><div class="profile-dialog-actions"><button class="btn primary" type="button" data-admin-users-done>Fechar</button></div></section>';
      const closeUsers = () => {
        usersBackdrop.hidden = true;
        trigger.focus();
      };
      const renderUsers = async () => {
        const list = usersBackdrop.querySelector('.admin-users-list');
        const projectPanel = usersBackdrop.querySelector('.admin-user-projects');
        projectPanel.hidden = true;
        list.hidden = false;
        usersBackdrop.querySelector('.admin-users-status').hidden = true;
        list.textContent = 'Carregando usuários…';
        try {
          const [profilesResult, projectsResult] = await Promise.all([
            client.from('profiles').select('user_id,email,username,full_name,role').order('email', { ascending: true }),
            client.from('projects').select('id,user_id')
          ]);
          if (profilesResult.error) throw profilesResult.error;
          if (projectsResult.error) throw projectsResult.error;
          const data = profilesResult.data || [];
          const projectCounts = new Map();
          for (const project of projectsResult.data || []) {
            projectCounts.set(project.user_id, (projectCounts.get(project.user_id) || 0) + 1);
          }
          list.replaceChildren();
          for (const profile of data || []) {
            const row = document.createElement('div');
            row.className = 'admin-user-row';
            const openUser = document.createElement('button');
            openUser.className = 'admin-user-open';
            openUser.type = 'button';
            openUser.setAttribute('aria-label', `Ver projetos de ${profile.email || profile.full_name || 'usuário'}`);
            const identity = document.createElement('span');
            identity.className = 'admin-user-identity';
            const name = document.createElement('strong');
            name.textContent = profile.full_name || 'Sem nome';
            const email = document.createElement('span');
            email.textContent = profile.email || 'E-mail indisponível';
            const count = projectCounts.get(profile.user_id) || 0;
            const projectCount = document.createElement('span');
            projectCount.className = 'admin-user-project-count';
            projectCount.textContent = `${count} ${count === 1 ? 'projeto salvo' : 'projetos salvos'}`;
            identity.append(name, email, projectCount);
            openUser.append(identity);
            openUser.addEventListener('click', () => { void renderUserProjects(profile); });
            const role = document.createElement('select');
            role.className = 'select admin-user-role';
            role.setAttribute('aria-label', `Cargo de ${profile.email || profile.full_name || 'usuário'}`);
            role.innerHTML = '<option value="user">user</option><option value="visitor">visitor</option><option value="admin">admin</option>';
            role.value = ['user', 'visitor', 'admin'].includes(profile.role) ? profile.role : 'user';
            if (profile.user_id === user.id) {
              const userOption = role.querySelector('option[value="user"]');
              userOption.disabled = true;
              role.title = 'Não é possível remover seu próprio cargo de admin.';
            }
            role.addEventListener('change', async () => {
              role.disabled = true;
              try {
                const { error: roleError } = await client.rpc('set_profile_role', {
                  target_user_id: profile.user_id,
                  target_role: role.value
                });
                if (roleError) throw roleError;
                profile.role = role.value;
              } catch (error) {
                role.value = ['user', 'visitor', 'admin'].includes(profile.role) ? profile.role : 'user';
                const status = usersBackdrop.querySelector('.admin-users-status');
                status.textContent = `Não foi possível alterar o cargo: ${error.message}`;
                status.hidden = false;
              } finally {
                role.disabled = false;
              }
            });
            row.append(openUser, role);
            list.append(row);
          }
          if (!data?.length) list.textContent = 'Nenhum usuário encontrado.';
        } catch (error) {
          list.textContent = `Não foi possível carregar os usuários. ${error.message}`;
        }
      };
      const renderUserProjects = async (profile) => {
        const list = usersBackdrop.querySelector('.admin-user-project-list');
        const projectPanel = usersBackdrop.querySelector('.admin-user-projects');
        usersBackdrop.querySelector('.admin-users-list').hidden = true;
        projectPanel.hidden = false;
        usersBackdrop.querySelector('.admin-users-status').hidden = true;
        const heading = usersBackdrop.querySelector('.admin-user-projects-title');
        heading.textContent = `Projetos de ${profile.full_name || profile.email || 'usuário'}`;
        list.textContent = 'Carregando projetos…';
        try {
          const { data, error } = await client.from('projects')
            .select('id,user_id,name,data,updated_at')
            .eq('user_id', profile.user_id)
            .order('updated_at', { ascending: false });
          if (error) throw error;
          list.replaceChildren();
          for (const project of data || []) {
            const row = document.createElement('div');
            row.className = 'admin-project-row';
            const details = document.createElement('div');
            details.className = 'admin-project-details';
            const name = document.createElement('strong');
            name.textContent = project.name || 'Projeto sem nome';
            const updated = document.createElement('span');
            updated.textContent = `Atualizado ${project.updated_at ? new Date(project.updated_at).toLocaleString('pt-BR') : '—'}`;
            details.append(name, updated);
            const open = document.createElement('button');
            open.className = 'btn primary';
            open.type = 'button';
            open.textContent = 'Abrir';
            open.addEventListener('click', () => {
              const opened = window.PANEL_STUDIO_OPEN_ADMIN_PROJECT?.({ ...project, updatedAt: project.updated_at });
              if (opened) closeUsers();
              else if (!window.PANEL_STUDIO_OPEN_ADMIN_PROJECT) {
                usersBackdrop.querySelector('.admin-users-status').textContent = 'Recarregue o editor para abrir este projeto.';
                usersBackdrop.querySelector('.admin-users-status').hidden = false;
              }
            });
            row.append(details, open);
            list.append(row);
          }
          if (!data?.length) list.textContent = 'Este usuário ainda não tem projetos salvos.';
        } catch (error) {
          list.textContent = `Não foi possível carregar os projetos. ${error.message}`;
        }
      };
      usersBackdrop.querySelector('.admin-users-back').addEventListener('click', () => { void renderUsers(); });
      usersBackdrop.querySelector('.profile-dialog-close').addEventListener('click', closeUsers);
      usersBackdrop.querySelector('[data-admin-users-done]').addEventListener('click', closeUsers);
      usersBackdrop.addEventListener('click', (event) => {
        if (event.target === usersBackdrop) closeUsers();
      });
      manageUsers.addEventListener('click', () => {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        usersBackdrop.hidden = false;
        void renderUsers();
        usersBackdrop.querySelector('.profile-dialog-close').focus();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !usersBackdrop.hidden) closeUsers();
      });
    }

    const profileBackdrop = document.createElement('div');
    profileBackdrop.className = 'profile-modal-backdrop';
    profileBackdrop.hidden = true;
    profileBackdrop.innerHTML = '<section class="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profileDialogTitle" tabindex="-1"><div class="profile-dialog-heading"><div><span class="profile-dialog-eyebrow">SUA CONTA</span><h2 id="profileDialogTitle">Perfil</h2></div><button class="profile-dialog-close" type="button" aria-label="Fechar perfil">×</button></div><dl class="profile-details"><div><dt>Nome</dt><dd data-profile-name></dd></div><div><dt>E-mail</dt><dd data-profile-email></dd></div></dl><div class="profile-dialog-actions"><button class="btn primary" type="button" data-profile-done>Fechar</button></div></section>';
    const profileDialog = profileBackdrop.querySelector('.profile-dialog');
    profileBackdrop.querySelector('[data-profile-name]').textContent = displayName;
    profileBackdrop.querySelector('[data-profile-email]').textContent = user.email || 'Não informado';
    const closeProfile = () => {
      profileBackdrop.hidden = true;
      trigger.focus();
    };
    const openProfile = () => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      profileBackdrop.hidden = false;
      profileBackdrop.querySelector('.profile-dialog-close').focus();
    };
    const setMenuOpen = (open) => {
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    };

    menu.append(menuIdentity, profileButton);
    if (manageUsers) menu.append(manageUsers);
    menu.append(signOut);
    account.append(trigger, menu);
    header.append(account, profileBackdrop);
    if (usersBackdrop) header.append(usersBackdrop);
    trigger.addEventListener('click', () => setMenuOpen(menu.hidden));
    profileButton.addEventListener('click', openProfile);
    profileBackdrop.querySelector('.profile-dialog-close').addEventListener('click', closeProfile);
    profileBackdrop.querySelector('[data-profile-done]').addEventListener('click', closeProfile);
    profileBackdrop.addEventListener('click', (event) => {
      if (event.target === profileBackdrop) closeProfile();
    });
    document.addEventListener('click', (event) => {
      if (!account.contains(event.target)) setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !profileBackdrop.hidden) closeProfile();
      else if (event.key === 'Escape' && !menu.hidden) {
        setMenuOpen(false);
        trigger.focus();
      }
      if (!profileBackdrop.hidden && event.key === 'Tab') {
        const focusable = [...profileDialog.querySelectorAll('button')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    signOut.addEventListener('click', async () => {
      setMenuOpen(false);
      try {
        if (window.PANEL_STUDIO_IS_DIRTY?.() && window.confirm('Salvar o projeto atual na sua conta antes de sair?')) {
          await window.PANEL_STUDIO_SAVE_PROJECT?.();
        }
        await window.PANEL_STUDIO_FLUSH_SYNC?.();
        const { error } = await client.auth.signOut();
        if (error) throw error;
        window.location.reload();
      } catch (error) {
        showMessage(`Não foi possível encerrar a sessão: ${error.message}`);
      }
    });
  }

  async function bootStudio(user) {
    if (!user) return;
    if (!isEditorPage) {
      window.location.replace('editor.html');
      return;
    }
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      const keys = makeStorageKeys(user.id);
      const { data: profile, error: profileError } = await client.from('profiles')
        .select('role,username')
        .eq('user_id', user.id)
        .single();
      if (profileError) console.warn('Não foi possível carregar o cargo do perfil; a sessão ficará no nível user até a migração de cargos estar disponível.', profileError);
      const role = !profileError && ['admin', 'visitor'].includes(profile?.role) ? profile.role : 'user';
      window.PANEL_STUDIO_USER = { id: user.id, email: user.email, username: profile?.username || user.user_metadata?.username || '', displayName: user.user_metadata?.full_name || user.email, role };
      window.PANEL_STUDIO_IS_ADMIN = role === 'admin';
      window.PANEL_STUDIO_IS_VISITOR = role === 'visitor';
      window.PANEL_STUDIO_KEYS = keys;
      window.PANEL_STUDIO_LIBRARY_API = {
        isAdmin: role === 'admin',
        async load() {
          const [categoryResult, componentResult] = await Promise.all([
            client.from('library_categories').select('id,name,parent_id,sort_order,side').order('sort_order').order('name'),
            client.from('library_components').select('id,name,category_id,width_mm,height_mm,color,icon,image,storage_path,sort_order,metadata').order('sort_order').order('name')
          ]);
          if (categoryResult.error) throw categoryResult.error;
          if (componentResult.error) throw componentResult.error;
          return { categories: categoryResult.data || [], components: componentResult.data || [] };
        },
        async saveCategory(category) {
          if (role !== 'admin') throw new Error('Apenas administradores podem alterar a biblioteca.');
          const { error } = await client.from('library_categories').upsert({ ...category, updated_by: user.id, updated_at: new Date().toISOString() });
          if (error) throw error;
        },
        async deleteCategory(id) {
          if (role !== 'admin') throw new Error('Apenas administradores podem alterar a biblioteca.');
          const { error } = await client.from('library_categories').delete().eq('id', id);
          if (error) throw error;
        },
        async saveComponent(component) {
          if (role !== 'admin') throw new Error('Apenas administradores podem alterar a biblioteca.');
          const { error } = await client.from('library_components').upsert({ ...component, updated_by: user.id, updated_at: new Date().toISOString() });
          if (error) throw error;
        },
        async deleteComponent(id) {
          if (role !== 'admin') throw new Error('Apenas administradores podem alterar a biblioteca.');
          const { error } = await client.from('library_components').delete().eq('id', id);
          if (error) throw error;
          // Keep uploaded image objects: saved panels may still reference them.
        },
        async uploadImage(file, componentId) {
          if (role !== 'admin') throw new Error('Apenas administradores podem enviar imagens.');
          const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
          const storagePath = `components/${componentId}.${extension}`;
          const { error } = await client.storage.from('library-assets').upload(storagePath, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
          if (error) throw error;
          const { data } = client.storage.from('library-assets').getPublicUrl(storagePath);
          return { image: data.publicUrl, storage_path: storagePath };
        }
      };
      try {
        const catalog = await window.PANEL_STUDIO_LIBRARY_API.load();
        const categoryById = new Map(catalog.categories.map((category) => [category.id, category]));
        window.PANEL_STUDIO_LIBRARY_DATA = {
          sidesEnabled: true,
          categories: catalog.categories,
          components: catalog.components.map((component) => {
            const category = categoryById.get(component.category_id);
            const parent = categoryById.get(category?.parent_id);
            return { ...component, side: category?.side || 'back', w: Number(component.width_mm), h: Number(component.height_mm), cat: parent ? `${parent.name} / ${category.name}` : (category?.name || 'Outros'), ...(component.metadata || {}) };
          })
        };
      } catch (error) {
        window.PANEL_STUDIO_LIBRARY_DATA = null;
        console.warn('Biblioteca compartilhada indisponível; usando o catálogo local. A migração de biblioteca pode não ter sido aplicada.', error);
      }
      await loadAndCacheProjects(user, keys);
      studioShell.hidden = false;
      await loadScript('assets/profile-storage.js');
      await loadScript('assets/library-admin.js?v=0.3.11');
      await loadScript('assets/app.js?v=0.3.15');
      await loadScript('painel-studio.js?v=0.3.15');
      addProfileControls(user);
      window.dispatchEvent(new Event('resize'));
      hideLoadingNotice();
    })().catch((error) => {
      bootPromise = null;
      studioShell.hidden = true;
      hideLoadingNotice();
      showMessage(`Não foi possível carregar seus projetos. ${error.message}`, 'error');
    });
    return bootPromise;
  }

  if (!isEditorPage) {
    signInTab.addEventListener('click', () => setMode('signin'));
    signUpTab.addEventListener('click', () => setMode('signup'));
    $('#togglePassword').addEventListener('click', (event) => {
      const button = event.currentTarget;
      const password = $('#authPassword');
      const revealing = password.type === 'password';
      password.type = revealing ? 'text' : 'password';
      button.textContent = revealing ? 'Ocultar' : 'Mostrar';
      button.setAttribute('aria-label', revealing ? 'Ocultar senha' : 'Mostrar senha');
      button.setAttribute('aria-pressed', String(revealing));
    });
  }

  const config = window.PANEL_STUDIO_SUPABASE_CONFIG || {};
  const supabaseApi = window.supabase?.createClient ? window.supabase : window.supabase?.default;
  const projectUrl = String(config.url || '').trim();
  const publicKey = String(config.publishableKey || config.anonKey || '').trim();
  if (!supabaseApi?.createClient || !projectUrl || !publicKey) {
    if (isEditorPage) {
      window.location.replace('index.html?setup=1');
      return;
    }
    setupNotice.hidden = false;
    submit.disabled = true;
    $('#authEmail').disabled = true;
    $('#authPassword').disabled = true;
    $('#authName').disabled = true;
    $('#authUsername').disabled = true;
    return;
  }

  try {
    client = supabaseApi.createClient(projectUrl, publicKey);
  } catch (error) {
    setupNotice.hidden = false;
    hideLoadingNotice();
    submit.disabled = true;
    showMessage(`Confira a URL e a chave pública do arquivo de configuração. ${error.message}`);
    return;
  }
  window.PANEL_STUDIO_SUPABASE = client;
  passwordRecovery = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
  if (passwordRecovery) setMode('reset');

  if (!isEditorPage) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    const identifier = $('#authEmail').value.trim();
    let email = identifier;
    const password = $('#authPassword').value;
    if (mode === 'reset' && password.length < 8) return showMessage('A senha precisa ter pelo menos 8 caracteres.');
    if (mode !== 'reset' && (!identifier || !password)) return showMessage('Informe seu e-mail ou nome de login e sua senha.');
    if (mode === 'signup' && password.length < 8) return showMessage('A senha precisa ter pelo menos 8 caracteres.');
    const username = $('#authUsername')?.value.trim().toLowerCase() || '';
    if (mode === 'signup' && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return showMessage('O nome de login deve ter de 3 a 32 caracteres, sem espaços. Use letras minúsculas, números, ponto, hífen ou sublinhado.');
    setBusy(true);
    try {
      if (mode === 'reset') {
        const { data, error } = await client.auth.updateUser({ password });
        if (error) throw error;
        passwordRecovery = false;
        await bootStudio(data.user);
      } else if (mode === 'signup') {
        const fullName = $('#authName').value.trim();
        const options = { data: { full_name: fullName, username } };
        if (window.location.protocol === 'https:' || window.location.protocol === 'http:') {
          options.emailRedirectTo = new URL('index.html', window.location.href).href;
        }
        const { data, error } = await client.auth.signUp({ email, password, options });
        if (error) throw error;
        if (data.session && data.user) await bootStudio(data.user);
        else showMessage('Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.', 'success');
      } else {
        if (!identifier.includes('@')) {
          const { data: resolvedEmail, error: lookupError } = await client.rpc('resolve_login_email', { login_identifier: identifier.toLowerCase() });
          if (lookupError) throw lookupError;
          if (!resolvedEmail) return showMessage('Usuário ou senha inválidos.');
          email = resolvedEmail;
        }
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await bootStudio(data.user);
      }
    } catch (error) {
      showMessage(error.message || 'Não foi possível autenticar. Confira seus dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  });

  if (!isEditorPage) $('#forgotPassword').addEventListener('click', async () => {
    clearMessage();
    const identifier = $('#authEmail').value.trim();
    if (!identifier) return showMessage('Informe seu e-mail ou nome de login para receber o link de redefinição.');
    try {
      const redirectTo = (window.location.protocol === 'https:' || window.location.protocol === 'http:')
        ? new URL('index.html', window.location.href).href
        : undefined;
      let email = identifier;
      if (!identifier.includes('@')) {
        const { data, error: lookupError } = await client.rpc('resolve_login_email', { login_identifier: identifier.toLowerCase() });
        if (lookupError) throw lookupError;
        if (!data) return showMessage('Se a conta estiver cadastrada, você receberá um link para redefinir a senha.', 'success');
        email = data;
      }
      const { error } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
      if (error) throw error;
      showMessage('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.', 'success');
    } catch (error) {
      showMessage(error.message || 'Não foi possível solicitar a redefinição da senha.');
    }
  });

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      passwordRecovery = true;
      setMode('reset');
      return;
    }
    if (passwordRecovery) return;
    if (session?.user && !bootPromise) queueMicrotask(() => { void bootStudio(session.user); });
    if (event === 'SIGNED_OUT' && isEditorPage) window.location.replace('index.html');
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    if (data.session?.user && !passwordRecovery) return bootStudio(data.session.user);
    if (isEditorPage && !data.session?.user) window.location.replace('index.html');
    return undefined;
  }).catch((error) => {
    if (isEditorPage) window.location.replace('index.html');
    else showMessage(`Não foi possível verificar sua sessão. ${error.message}`);
  });
}

if (document.getElementById('auth-root')) {
  document.addEventListener('panel-studio-auth-ready', initializePanelStudioAuth, { once: true });
} else {
  initializePanelStudioAuth();
}

