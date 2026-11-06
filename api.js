/* TheMealDB V1 educational key. Recommendation decisions live in core.js. */
class MealService {
  constructor() { this.base = 'https://www.themealdb.com/api/json/v1/1/'; this.cache = new Map(); }
  async request(endpoint, params = {}) {
    const url = this.base + endpoint + '?' + new URLSearchParams(params);
    if (this.cache.has(url) && endpoint !== 'random.php') return this.cache.get(url);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Recipe service returned HTTP ' + response.status);
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid recipe response.');
      this.cache.set(url, data); return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Recipe request timed out. Please try again.');
      throw new Error('Could not reach TheMealDB. Check your connection and try again. ' + error.message);
    } finally { clearTimeout(timer); }
  }
  meals(data) {
    if (data.meals === null) return [];
    if (!Array.isArray(data.meals)) throw new Error('The recipe service returned an unexpected response.');
    return data.meals.map(EasyCore.Recipe.fromAPI);
  }
  async categories() {
    const data = await this.request('categories.php');
    if (!Array.isArray(data.categories)) throw new Error('Category data is unavailable.');
    return data.categories.map(x => x.strCategory).filter(x => typeof x === 'string').sort();
  }
  async search(query, category = 'All') {
    if (!query && category !== 'All')
      return this.meals(await this.request('filter.php', { c: category })).map(x => { x.category = category; return x; });
    return this.meals(await this.request('search.php', { s: query })).filter(x =>
      category === 'All' || EasyCore.normalize(x.category) === EasyCore.normalize(category));
  }
  async details(id) {
    const meals = this.meals(await this.request('lookup.php', { i: id }));
    if (!meals.length) throw new Error('This recipe is no longer available.');
    return meals[0];
  }
  async random() {
    const meals = this.meals(await this.request('random.php'));
    if (!meals.length) throw new Error('No surprise recipe was returned. Try again.');
    return meals[0];
  }
  async candidates(category, ingredients) {
    let candidates;
    if (ingredients.length) {
      // Resolve singular/plural aliases to actual names used by the API ingredient index.
      const index = await this.request('list.php', { i: 'list' });
      if (!Array.isArray(index.meals)) throw new Error('The ingredient index is unavailable. Try again.');
      const names = new Map(index.meals.filter(x => typeof x.strIngredient === 'string')
        .map(x => [EasyCore.canonical(x.strIngredient), x.strIngredient]));
      const batches = await Promise.all(ingredients.slice(0, 3).map(i =>
        this.request('filter.php', { i: (names.get(i) || i).replace(/ /g, '_') }).then(d => this.meals(d))));
      candidates = [...new Map(batches.flat().map(x => [x.id, x])).values()];
      if (category !== 'All') {
        const ids = new Set((await this.search('', category)).map(x => x.id));
        candidates = candidates.filter(x => ids.has(x.id));
      }
    } else candidates = await this.search('', category);
    candidates = candidates.slice(0, 24);
    const full = [];
    for (let i = 0; i < candidates.length; i += 4)
      full.push(...await Promise.all(candidates.slice(i, i + 4).map(x => x.ingredients.length ? x : this.details(x.id))));
    return full;
  }
}

