(() => {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const sortRows = (rows) => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));

  window.PANEL_STUDIO_INIT_LIBRARY_ADMIN = ({ onChange, toast }) => {
    const trigger = document.getElementById('libraryManagerBtn');
    const api = window.PANEL_STUDIO_LIBRARY_API;
    if (!trigger || !api || window.PANEL_STUDIO_IS_ADMIN !== true) return;
    trigger.hidden = false;
    if (trigger.dataset.ready) return;
    trigger.dataset.ready = 'true';

    const backdrop = document.createElement('div');
    backdrop.className = 'library-admin-backdrop';
    backdrop.id = 'libraryAdminBackdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="library-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="libraryAdminTitle" tabindex="-1">
        <header class="library-admin-heading"><div><span class="library-admin-eyebrow">ADMINISTRAÇÃO</span><h2 id="libraryAdminTitle">Biblioteca de componentes</h2><p>Organize categorias e componentes compartilhados com todos os perfis.</p></div><div class="library-admin-heading-actions"><div class="library-admin-side-switch" role="group" aria-label="Biblioteca a editar"><button type="button" data-library-side="back" class="is-active" aria-pressed="true">Fundo</button><button type="button" data-library-side="lid" aria-pressed="false">Tampa</button></div><button class="library-admin-close" type="button" aria-label="Fechar">×</button></div></header>
        <div class="library-admin-body">
          <aside class="library-admin-categories"><div class="library-admin-section-heading"><strong>Categorias</strong><button class="btn" type="button" data-action="add-category">＋ Categoria</button></div><button class="btn library-admin-add-sub" type="button" data-action="add-subcategory">＋ Subcategoria</button><form class="library-admin-category-form" hidden><strong data-category-form-title>Nova categoria</strong><label>Nome da categoria<input name="name" required maxlength="80" placeholder="Ex.: Proteção"></label><input name="id" type="hidden"><input name="parentId" type="hidden"><input name="sortOrder" type="hidden"><div class="library-admin-form-actions"><button class="btn" type="button" data-action="cancel-category">Cancelar</button><button class="btn primary" type="submit">Salvar categoria</button></div></form><div class="library-admin-category-list"></div><p class="library-admin-note">Selecione uma categoria para listar seus componentes. Use ↑ e ↓ para ordenar.</p></aside>
          <section class="library-admin-components"><div class="library-admin-section-heading"><strong class="library-admin-current-category">Componentes</strong><button class="btn primary" data-action="new-component">＋ Componente</button></div><div class="library-admin-component-list"></div><form class="library-admin-form" hidden>
            <div class="library-admin-form-heading"><strong data-form-title>Novo componente</strong><button class="btn icon" type="button" data-action="cancel-edit" aria-label="Fechar edição">×</button></div>
            <input type="hidden" name="id"><label>Nome<input name="name" required maxlength="120" placeholder="Ex.: Disjuntor WEG MDW"></label>
            <div class="library-admin-form-row"><label>Categoria<select name="categoryId" required></select></label><label>Ícone<input name="icon" maxlength="8" value="▦"></label><label>Formato<select name="shape"><option value="rect">Retangular</option><option value="circle">Circular</option></select></label></div>
            <div class="library-admin-form-row"><label>Largura (mm)<input name="w" type="number" min="1" max="3000" step="0.1" required></label><label>Altura (mm)<input name="h" type="number" min="1" max="3000" step="0.1" required></label><label>Cor<input name="color" type="color" value="#5aa8d8"></label></div>
            <label>Imagem do componente<input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG ou WebP. A imagem ficará compartilhada na biblioteca.</small></label><div class="library-admin-image-preview"></div><label class="library-admin-remove-image" hidden><input name="removeImage" type="checkbox"> Remover a imagem atual ao salvar</label>
            <div class="library-admin-form-actions"><button class="btn" type="button" data-action="cancel-edit">Cancelar</button><button class="btn primary" type="submit">Salvar componente</button></div>
          </form></section>
        </div><p class="library-admin-status" role="status" hidden></p>
      </section>`;
    document.body.append(backdrop);

    const dialog = backdrop.querySelector('.library-admin-dialog');
    const categoryList = backdrop.querySelector('.library-admin-category-list');
    const componentList = backdrop.querySelector('.library-admin-component-list');
    const categoryForm = backdrop.querySelector('.library-admin-category-form');
    const form = backdrop.querySelector('.library-admin-form');
    const status = backdrop.querySelector('.library-admin-status');
    let categories = [];
    let components = [];
    let allCategories = [];
    let allComponents = [];
    let activeSide = document.getElementById('viewLid')?.getAttribute('aria-pressed') === 'true' ? 'lid' : 'back';
    let selectedCategoryId = null;
    let editingId = null;
    let editingCategoryId = null;

    const setStatus = (message = '', isError = false) => {
      status.textContent = message;
      status.hidden = !message;
      status.classList.toggle('is-error', isError);
    };
    const updateApp = () => onChange({ categories: allCategories, components: allComponents });
    const applySide = () => {
      categories = sortRows(allCategories.filter((row) => (row.side || 'back') === activeSide));
      const ids = new Set(categories.map((row) => row.id));
      components = sortRows(allComponents.filter((row) => ids.has(row.category_id)));
      if (!categories.some((row) => row.id === selectedCategoryId)) selectedCategoryId = categories[0]?.id || null;
      for (const button of backdrop.querySelectorAll('[data-library-side]')) {
        const selected = button.dataset.librarySide === activeSide;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
    };
    const refresh = async () => {
      setStatus('Carregando biblioteca…');
      try {
        const data = await api.load();
        allCategories = sortRows(data.categories || []);
        allComponents = sortRows(data.components || []);
        applySide();
        render();
        updateApp();
        setStatus('');
      } catch (error) {
        setStatus(`Não foi possível carregar a biblioteca. ${error.message}`, true);
      }
    };
    const render = () => {
      const childMap = new Map();
      for (const category of categories) {
        const key = category.parent_id || '';
        childMap.set(key, [...(childMap.get(key) || []), category]);
      }
      for (const rows of childMap.values()) rows.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR'));
      const flat = [];
      const walk = (parentId = '', depth = 0) => (childMap.get(parentId) || []).forEach((row) => { flat.push({ ...row, depth }); walk(row.id, depth + 1); });
      walk();
      categoryList.innerHTML = flat.map((category) => `
        <div class="library-admin-category-row${category.id === selectedCategoryId ? ' is-selected' : ''}" style="--depth:${category.depth}">
          <button class="library-admin-category-select" type="button" data-select-category="${escapeHtml(category.id)}"><span>${category.depth ? '↳ ' : ''}${escapeHtml(category.name)}</span><small>${components.filter((item) => item.category_id === category.id).length}</small></button>
          <button type="button" data-category-move="up" data-id="${escapeHtml(category.id)}" title="Mover para cima" aria-label="Mover ${escapeHtml(category.name)} para cima">↑</button><button type="button" data-category-move="down" data-id="${escapeHtml(category.id)}" title="Mover para baixo" aria-label="Mover ${escapeHtml(category.name)} para baixo">↓</button>
          <button type="button" data-category-rename="${escapeHtml(category.id)}" title="Editar categoria" aria-label="Editar categoria ${escapeHtml(category.name)}">✎</button><button type="button" class="is-danger" data-category-delete="${escapeHtml(category.id)}" aria-label="Excluir ${escapeHtml(category.name)}">×</button>
        </div>`).join('');
      const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
      backdrop.querySelector('.library-admin-current-category').textContent = selectedCategory ? selectedCategory.name : 'Componentes';
      const choices = flat.map((category) => `<option value="${escapeHtml(category.id)}">${'　'.repeat(category.depth)}${escapeHtml(category.name)}</option>`).join('');
      form.elements.categoryId.innerHTML = choices;
      const entries = components.filter((item) => !selectedCategoryId || item.category_id === selectedCategoryId);
      componentList.innerHTML = entries.length ? entries.map((item, index) => `
        <article class="library-admin-component-row"><div class="library-admin-component-thumb">${item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : `<span>${escapeHtml(item.icon || '▦')}</span>`}</div><div class="library-admin-component-info"><strong>${escapeHtml(item.name)}</strong><span>${item.width_mm} × ${item.height_mm} mm</span></div><div class="library-admin-row-actions"><button type="button" data-component-move="up" data-id="${escapeHtml(item.id)}" title="Mover para cima" aria-label="Mover ${escapeHtml(item.name)} para cima">↑</button><button type="button" data-component-move="down" data-id="${escapeHtml(item.id)}" title="Mover para baixo" aria-label="Mover ${escapeHtml(item.name)} para baixo">↓</button><button type="button" data-component-duplicate="${escapeHtml(item.id)}" title="Duplicar componente" aria-label="Duplicar ${escapeHtml(item.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8V4h12v12h-4M4 8h12v12H4z"/></svg></button><button type="button" data-component-edit="${escapeHtml(item.id)}" title="Editar componente" aria-label="Editar ${escapeHtml(item.name)}">Editar</button><button type="button" class="is-danger" data-component-delete="${escapeHtml(item.id)}" aria-label="Excluir ${escapeHtml(item.name)}">${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>'}</button></div></article>`).join('') : '<div class="library-admin-empty">Nenhum componente nesta categoria.</div>';
      backdrop.querySelector('[data-action="add-subcategory"]').disabled = !selectedCategoryId || Boolean(selectedCategory?.parent_id);
    };
    const showForm = (component = null) => {
      categoryForm.hidden = true;
      if (!categories.length) return setStatus('Crie uma categoria antes de adicionar componentes.', true);
      editingId = component?.id || null;
      form.reset();
      form.elements.id.value = component?.id || '';
      form.elements.name.value = component?.name || '';
      form.elements.categoryId.value = component?.category_id || selectedCategoryId || categories[0].id;
      form.elements.icon.value = component?.icon || '▦';
      form.elements.shape.value = component?.metadata?.shape || component?.shape || 'rect';
      form.elements.w.value = component?.width_mm ?? 30;
      form.elements.h.value = component?.height_mm ?? 50;
      form.elements.color.value = component?.color || '#5aa8d8';
      form.querySelector('[data-form-title]').textContent = component ? 'Editar componente' : 'Novo componente';
      const preview = form.querySelector('.library-admin-image-preview');
      preview.innerHTML = component?.image ? `<img src="${escapeHtml(component.image)}" alt="Imagem atual do componente"><span>Imagem atual</span>` : '';
      form.querySelector('.library-admin-remove-image').hidden = !component?.image;
      componentList.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    };
    const showCategoryForm = ({ category = null, parentId = null } = {}) => {
      categoryForm.reset();
      editingCategoryId = category?.id || null;
      categoryForm.elements.id.value = category?.id || '';
      categoryForm.elements.parentId.value = category?.parent_id || parentId || '';
      const siblings = categories.filter((item) => (item.parent_id || '') === (category?.parent_id || parentId || ''));
      categoryForm.elements.sortOrder.value = String(category?.sort_order ?? siblings.length);
      categoryForm.elements.name.value = category?.name || '';
      categoryForm.querySelector('[data-category-form-title]').textContent = category ? 'Editar categoria' : parentId ? 'Nova subcategoria' : 'Nova categoria';
      componentList.hidden = true;
      form.hidden = true;
      categoryForm.hidden = false;
      categoryForm.elements.name.focus();
    };
    const moveInGroup = async (rows, id, direction, save) => {
      const index = rows.findIndex((row) => row.id === id);
      const next = index + (direction === 'up' ? -1 : 1);
      if (index < 0 || next < 0 || next >= rows.length) return;
      [rows[index].sort_order, rows[next].sort_order] = [rows[next].sort_order, rows[index].sort_order];
      try { await Promise.all([save(rows[index]), save(rows[next])]); await refresh(); }
      catch (error) { setStatus(`Não foi possível alterar a ordem. ${error.message}`, true); }
    };
    const close = () => { backdrop.hidden = true; trigger.focus(); };
    trigger.addEventListener('click', () => { backdrop.hidden = false; dialog.focus(); void refresh(); });
    backdrop.querySelectorAll('[data-library-side]').forEach((button) => button.addEventListener('click', () => {
      const nextSide = button.dataset.librarySide;
      if (nextSide === activeSide) return;
      activeSide = nextSide;
      selectedCategoryId = null;
      categoryForm.reset(); editingCategoryId = null; categoryForm.hidden = true;
      form.reset(); editingId = null; form.hidden = true; componentList.hidden = false;
      applySide(); render(); setStatus('');
    }));
    backdrop.querySelector('.library-admin-close').addEventListener('click', close);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    backdrop.querySelectorAll('[data-action="cancel-edit"]').forEach((button) => button.addEventListener('click', () => { form.reset(); editingId = null; form.hidden = true; componentList.hidden = false; }));
    backdrop.querySelector('[data-action="cancel-category"]').addEventListener('click', () => { categoryForm.reset(); editingCategoryId = null; categoryForm.hidden = true; componentList.hidden = false; });
    backdrop.querySelector('[data-action="add-category"]').addEventListener('click', () => showCategoryForm());
    backdrop.querySelector('[data-action="add-subcategory"]').addEventListener('click', () => {
      const parent = categories.find((category) => category.id === selectedCategoryId);
      if (!parent) return;
      if (parent.parent_id) return setStatus('As subcategorias podem ter apenas um nível de profundidade.', true);
      showCategoryForm({ parentId: parent.id });
    });
    backdrop.querySelector('[data-action="new-component"]').addEventListener('click', () => showForm());
    categoryList.addEventListener('click', async (event) => {
      const select = event.target.closest('[data-select-category]');
      if (select) { selectedCategoryId = select.dataset.selectCategory; form.hidden = true; componentList.hidden = false; render(); return; }
      const move = event.target.closest('[data-category-move]');
      if (move) {
        const category = categories.find((item) => item.id === move.dataset.id);
        const siblings = sortRows(categories.filter((item) => (item.parent_id || '') === (category.parent_id || '')));
        await moveInGroup(siblings, category.id, move.dataset.categoryMove, (row) => api.saveCategory(row)); return;
      }
      const rename = event.target.closest('[data-category-rename]');
      if (rename) {
        const category = categories.find((item) => item.id === rename.dataset.categoryRename);
        if (category) showCategoryForm({ category });
        return;
      }
      const remove = event.target.closest('[data-category-delete]');
      if (remove) {
        const category = categories.find((item) => item.id === remove.dataset.categoryDelete);
        if (!confirm(`Excluir a categoria “${category.name}”? Ela precisa estar vazia e sem subcategorias.`)) return;
        try { await api.deleteCategory(category.id); await refresh(); toast('Categoria excluída'); }
        catch (error) { setStatus(`A categoria precisa estar vazia para ser excluída. ${error.message}`, true); }
      }
    });
    componentList.addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-component-edit]');
      if (edit) return showForm(components.find((item) => item.id === edit.dataset.componentEdit));
      const move = event.target.closest('[data-component-move]');
      if (move) {
        const component = components.find((item) => item.id === move.dataset.id);
        const rows = sortRows(components.filter((item) => item.category_id === component.category_id));
        await moveInGroup(rows, component.id, move.dataset.componentMove, (row) => api.saveComponent(row)); return;
      }
      const duplicateButton = event.target.closest('[data-component-duplicate]');
      if (duplicateButton) {
        const component = components.find((item) => item.id === duplicateButton.dataset.componentDuplicate);
        if (!component) return;
        const siblings = components.filter((item) => item.category_id === component.category_id);
        const duplicate = {
          ...component,
          id: `part-${crypto.randomUUID()}`,
          name: `${component.name} (cópia)`,
          sort_order: Math.max(-1, ...siblings.map((item) => Number(item.sort_order) || 0)) + 1,
          metadata: { ...(component.metadata || {}) }
        };
        setStatus('Duplicando componente…');
        try {
          await api.saveComponent(duplicate);
          await refresh();
          toast('Componente duplicado');
        } catch (error) { setStatus(`Não foi possível duplicar o componente. ${error.message}`, true); }
        return;
      }
      const remove = event.target.closest('[data-component-delete]');
      if (remove) {
        const component = components.find((item) => item.id === remove.dataset.componentDelete);
        if (!confirm(`Excluir “${component.name}” da biblioteca compartilhada?`)) return;
        try { await api.deleteComponent(component.id); await refresh(); toast('Componente excluído'); }
        catch (error) { setStatus(`Não foi possível excluir o componente. ${error.message}`, true); }
      }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const id = editingId || `part-${crypto.randomUUID()}`;
      const old = components.find((item) => item.id === id);
      const removeImage = data.get('removeImage') === 'on';
      const row = { id, name: String(data.get('name')).trim(), category_id: String(data.get('categoryId')), width_mm: Number(data.get('w')), height_mm: Number(data.get('h')), color: String(data.get('color')), icon: String(data.get('icon') || '▦').trim(), image: removeImage ? null : old?.image || null, storage_path: removeImage ? null : old?.storage_path || null, sort_order: old?.sort_order ?? components.filter((item) => item.category_id === String(data.get('categoryId'))).length, metadata: { ...(old?.metadata || {}), shape: String(data.get('shape') || 'rect') } };
      const file = data.get('imageFile');
      if (!row.name || !row.category_id || !(row.width_mm > 0 && row.height_mm > 0)) return setStatus('Informe nome, categoria e dimensões válidas.', true);
      setStatus('Salvando componente…');
      try {
        if (file instanceof File && file.size) Object.assign(row, await api.uploadImage(file, row.id));
        await api.saveComponent(row);
        selectedCategoryId = row.category_id;
        form.hidden = true; componentList.hidden = false;
        await refresh(); toast(old ? 'Componente atualizado' : 'Componente adicionado à biblioteca');
      } catch (error) { setStatus(`Não foi possível salvar o componente. ${error.message}`, true); }
    });
    categoryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = categoryForm.elements.name.value.trim();
      if (!name) return;
      const wasEditing = Boolean(editingCategoryId);
      const id = editingCategoryId || `cat-${crypto.randomUUID()}`;
      const category = { id, name, side: activeSide, parent_id: categoryForm.elements.parentId.value || null, sort_order: Number(categoryForm.elements.sortOrder.value) || 0 };
      setStatus('Salvando categoria…');
      try {
        await api.saveCategory(category);
        selectedCategoryId = id;
        categoryForm.reset();
        editingCategoryId = null;
        categoryForm.hidden = true;
        componentList.hidden = false;
        await refresh();
        toast(wasEditing ? 'Categoria atualizada' : category.parent_id ? 'Subcategoria criada' : 'Categoria criada');
      } catch (error) { setStatus(`Não foi possível salvar a categoria. ${error.message}`, true); }
    });
  };
})();

