/* Pure, explainable application logic: shared by the renderer and Node tests. */
(function (root) {
  'use strict';
  const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const aliases = { eggs: 'egg', tomatoes: 'tomato', onions: 'onion', potatoes: 'potato',
    'chicken breasts': 'chicken breast', 'garlic cloves': 'garlic' };
  const canonical = value => aliases[normalize(value)] || normalize(value);
  function ingredientMatches(required, available) {
    const a = canonical(required), b = canonical(available);
    if (!a || !b) return false;
    if (a === b) return true;
    // Whole-word phrase matching: rice must not match licorice.
    return (' ' + a + ' ').includes(' ' + b + ' ') || (' ' + b + ' ').includes(' ' + a + ' ');
  }
  function parseIngredients(text) {
    const values = [...new Set(String(text).split(',').map(canonical).filter(Boolean))];
    if (values.length > 8) throw new Error('Enter up to 8 ingredients, separated by commas.');
    if (values.some(x => x.length > 60 || !/^[\p{L}\p{N} '\-]+$/u.test(x)))
      throw new Error('Use ingredient names with letters, numbers, spaces, apostrophes or hyphens.');
    return values;
  }
  class Recipe {
    constructor(data) {
      this.id = String(data.id); this.name = String(data.name);
      this.category = String(data.category || 'Other'); this.area = String(data.area || '');
      this.image = String(data.image || ''); this.instructions = String(data.instructions || '');
      this.ingredients = Array.isArray(data.ingredients) ? data.ingredients.map(x => ({
        name: String(x.name), measure: String(x.measure || '')
      })) : [];
      this.source = data.source || 'TheMealDB';
    }
    static fromAPI(meal) {
      if (!meal || !meal.idMeal || !meal.strMeal) throw new Error('The recipe service returned incomplete data.');
      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const name = String(meal['strIngredient' + i] || '').trim();
        if (name) ingredients.push({ name, measure: String(meal['strMeasure' + i] || '').trim() });
      }
      return new Recipe({ id: meal.idMeal, name: meal.strMeal, category: meal.strCategory,
        area: meal.strArea, image: meal.strMealThumb, instructions: meal.strInstructions, ingredients });
    }
  }
  function suggestRecipes(recipes, category, available) {
    if ((!category || category === 'All') && !available.length)
      throw new Error('Choose a category or enter available ingredients first.');
    const results = [];
    for (const recipe of recipes) {
      let reason;
      // These original control statements determine suitability; the API only supplies data.
      if (category && category !== 'All' && normalize(recipe.category) !== normalize(category)) {
        continue;
      } else if (available.length) {
        if (!recipe.ingredients.length) continue;
        const matched = recipe.ingredients.filter(x => available.some(a => ingredientMatches(x.name, a)));
        if (!matched.length) continue;
        const missing = recipe.ingredients.filter(x => !available.some(a => ingredientMatches(x.name, a)));
        const ratio = matched.length / recipe.ingredients.length;
        if (ratio === 1) reason = 'All listed ingredients available';
        else if (ratio >= 0.5) reason = 'A good pantry match';
        else reason = 'A few more ingredients needed';
        results.push({ recipe, reason, ratio, percent: Math.round(ratio * 100),
          matched: matched.map(x => x.name), missing: missing.map(x => x.name) });
        continue;
      } else {
        switch (normalize(category)) {
          case 'vegetarian': case 'vegan': reason = 'Matches your plant-based category'; break;
          case 'seafood': reason = 'A seafood idea for your menu'; break;
          case 'dessert': reason = 'Something sweet from your selected category'; break;
          default: reason = 'Selected for your ' + recipe.category.toLowerCase() + ' menu';
        }
      }
      results.push({ recipe, reason, ratio: null, percent: null, matched: [], missing: [] });
    }
    return results.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0) ||
      a.missing.length - b.missing.length || a.recipe.name.localeCompare(b.recipe.name)).slice(0, 8);
  }
  const fractions = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' };
  function quantity(measure) {
    const text = String(measure).replace(/[½¼¾⅓⅔⅛]/g, x => ' ' + fractions[x]).trim();
    const m = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)(.*)$|^(\d+(?:\.\d+)?)(.*)$/);
    if (!m) return null;
    let amount, unit;
    if (m[2]) { if (Number(m[3]) === 0) return null;
      amount = Number(m[1] || 0) + Number(m[2]) / Number(m[3]); unit = m[4].trim();
    } else { amount = Number(m[5]); unit = m[6].trim(); }
    if (/^(?:[-–/]|to\b)/i.test(unit)) return null;
    return { amount, unit };
  }
  function servingCount(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('Servings must be whole numbers from 1 to 100.');
    return n;
  }
  function scaleMeasure(measure, original, target) {
    const factor = servingCount(target) / servingCount(original), parsed = quantity(measure);
    if (!parsed) return { text: measure || 'As needed', scaled: false };
    return { text: String(Number((parsed.amount * factor).toFixed(3))) + (parsed.unit ? ' ' + parsed.unit : ''), scaled: true };
  }
  function localDate(date = new Date()) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function validatePlan(data) {
    const title = String(data.title || '').trim();
    if (!title || title.length > 100) throw new Error('Enter a meal name of 1–100 characters.');
    const date = String(data.date || ''), parsed = new Date(date + 'T12:00:00');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || localDate(parsed) !== date)
      throw new Error('Choose a valid meal date.');
    if (!['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(data.slot)) throw new Error('Choose a valid meal slot.');
    const notes = String(data.notes || '').trim();
    if (notes.length > 500) throw new Error('Keep notes within 500 characters.');
    return { title, date, slot: data.slot, servings: servingCount(data.servings), notes,
      recipe: data.recipe ? new Recipe(data.recipe) : null };
  }
  const api = { normalize, canonical, ingredientMatches, parseIngredients, Recipe, suggestRecipes,
    quantity, servingCount, scaleMeasure, localDate, validatePlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EasyCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
