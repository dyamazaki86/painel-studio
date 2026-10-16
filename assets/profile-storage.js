(() => {
  const keys = window.PANEL_STUDIO_KEYS;
  if (!keys) throw new Error('O perfil precisa estar autenticado antes de abrir o editor.');

  const profileKeys = {
    'painel-studio-v1': keys.draft,
    'painel-studio-projects-v1': keys.projects,
    'painel-studio-active-project': keys.active,
    'painel-studio-draft-name': keys.draftName,
    'painel-studio-collapsed-library-categories': keys.collapsedLibrary
  };
  const getItem = Storage.prototype.getItem;
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  const scopedKey = (key) => profileKeys[String(key)] || String(key);

  Storage.prototype.getItem = function (key) {
    return getItem.call(this, scopedKey(key));
  };
  Storage.prototype.setItem = function (key, value) {
    return setItem.call(this, scopedKey(key), value);
  };
  Storage.prototype.removeItem = function (key) {
    return removeItem.call(this, scopedKey(key));
  };
})();
