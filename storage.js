(function (root) {
  'use strict';
  const Core = typeof module !== 'undefined' && module.exports ? require('./core') : root.EasyCore;
  class EasyStore {
    constructor(storage, notify = () => {}) { this.storage = storage; this.notify = notify; }
    read(key, fallback, validate, strict = false) {
      try {
        const raw = this.storage.getItem('easycook.' + key + '.v1');
        if (raw === null) return fallback;
        const value = JSON.parse(raw);
        if (!validate(value)) throw new Error('Invalid saved data');
        return value;
      } catch {
        this.notify('Saved ' + key + ' could not be read. Existing stored data has not been changed.', true);
        if (strict) throw new Error('Existing saved data could not be read. No changes were saved.');
        return fallback;
      }
    }
    write(key, data) {
      try { this.storage.setItem('easycook.' + key + '.v1', JSON.stringify(data)); }
      catch { throw new Error('Could not save locally. Storage may be full or unavailable. No changes were saved.'); }
    }
    plans(strict = false) {
      return this.read('plans', [], x => Array.isArray(x) && x.every(p => {
        try { return typeof p.id === 'string' && !!Core.validatePlan(p); } catch { return false; }
      }), strict);
    }
    savePlan(data, id = null) {
      const valid = Core.validatePlan(data), plans = this.plans(true);
      if (id) {
        const index = plans.findIndex(p => p.id === id);
        if (index < 0) throw new Error('This meal no longer exists. Refresh the planner.');
        plans[index] = { ...valid, id, createdAt: plans[index].createdAt, updatedAt: new Date().toISOString() };
      } else plans.push({ ...valid, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
      this.write('plans', plans); return plans;
    }
    deletePlan(id) {
      const plans = this.plans(true);
      if (!plans.some(p => p.id === id)) throw new Error('This meal has already been removed.');
      const next = plans.filter(p => p.id !== id); this.write('plans', next); return next;
    }
    recommendations() {
      return this.read('recommendations', null, x => x && typeof x.category === 'string' &&
        typeof x.ingredients === 'string' && typeof x.savedAt === 'string' &&
        Array.isArray(x.items) && x.items.every(i => i.recipe && typeof i.recipe.id === 'string' &&
          typeof i.recipe.name === 'string' && Array.isArray(i.recipe.ingredients) &&
          typeof i.reason === 'string' && Array.isArray(i.matched) && Array.isArray(i.missing)));
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = EasyStore;
  else root.EasyStore = EasyStore;
})(typeof window !== 'undefined' ? window : globalThis);

