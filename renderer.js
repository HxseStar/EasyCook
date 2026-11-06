'use strict';
const { $, h, notice, store } = EasyUI;
const service = new MealService();
let offlineRecipes = [], offlineMode = false, current = [], shown = 0, requestSequence = 0;
let selectedRecipe = null;
let savedRecommendations = store.recommendations();

async function loadOffline() {
  if (offlineRecipes.length) return offlineRecipes;
  const response = await fetch('data/recipes.json');
  if (!response.ok) throw new Error('The offline recipe collection could not be loaded.');
  const data = await response.json();
  if (!Array.isArray(data.recipes)) throw new Error('The offline recipe file is invalid.');
  offlineRecipes = data.recipes.map(x => new EasyCore.Recipe(x)); return offlineRecipes;
}
function setCategories(categories, previous = $('category').value) {
  $('category').replaceChildren(h('option', { value: 'All' }, 'All categories'),
    ...categories.map(x => h('option', { value: x }, x)));
  $('category').value = categories.includes(previous) ? previous : 'All';
}
async function useOffline() {
  try {
    await loadOffline(); offlineMode = true;
    setCategories([...new Set(offlineRecipes.map(x => x.category))].sort());
    $('source-label').textContent = 'Offline collection · 8 complete starter recipes';
    $('offline').textContent = 'Reconnect to live recipes';
    $('surprise').textContent = '✧ Surprise me';
    await searchRecipes();
    notice('Using the bundled offline collection. Live API recipes require an internet connection.');
  } catch (err) { notice(err.message, true); }
}
function displayResults() {
  const visible = current.slice(0, shown);
  $('results').replaceChildren(...visible.map(x => EasyUI.card(x, openRecipe, addToPlan)));
  if (!visible.length) EasyUI.empty($('results'), 'No recipes found.', 'Try a shorter recipe name or another category.');
  $('result-count').textContent = current.length + ' recipe' + (current.length === 1 ? '' : 's') + (current.length ? ' · ' + shown + ' shown' : '');
  $('load-more').hidden = shown >= current.length;
}
async function searchRecipes() {
  const token = ++requestSequence, query = $('search').value.trim(), category = $('category').value;
  if (query.length > 80) { notice('Keep recipe searches within 80 characters.', true); return; }
  $('search-button').disabled = true; EasyUI.busy($('results')); $('load-more').hidden = true;
  try {
    const recipes = offlineMode ? (await loadOffline()).filter(x =>
      (!query || EasyCore.normalize(x.name).includes(EasyCore.normalize(query))) &&
      (category === 'All' || x.category === category)) : await service.search(query, category);
    if (token !== requestSequence) return;
    current = recipes; shown = Math.min(9, current.length); displayResults();
    $('results-title').textContent = query ? 'Recipes for “' + query + '”' :
      category !== 'All' ? 'A taste of ' + category.toLowerCase() : 'Explore the recipe collection';
  } catch (err) {
    if (token !== requestSequence) return;
    current = []; shown = 0; $('result-count').textContent = '';
    EasyUI.empty($('results'), 'We couldn’t load the recipes.', 'Try again, or select “Use offline collection” above.');
    notice(err.message, true);
  } finally { if (token === requestSequence) $('search-button').disabled = false; }
}
async function completeRecipe(recipe) {
  if (recipe.ingredients.length && recipe.instructions) return recipe;
  if (recipe.id.startsWith('local-')) return (await loadOffline()).find(x => x.id === recipe.id) || recipe;
  return service.details(recipe.id);
}
async function openRecipe(recipe) {
  try { EasyUI.showRecipe(await completeRecipe(recipe), addToPlan); }
  catch (err) { notice(err.message, true); }
}
async function addToPlan(recipe, servings = 2) {
  try {
    selectedRecipe = await completeRecipe(recipe);
    $('quick-recipe-name').textContent = selectedRecipe.name;
    $('quick-date').value = EasyCore.localDate(); $('quick-slot').value = 'Dinner';
    $('quick-servings').value = servings; $('quick-notes').value = ''; $('quick-error').textContent = '';
    $('plan-dialog').showModal();
  } catch (err) { notice(err.message, true); }
}
function renderRecommendations() {
  const saved = savedRecommendations;
  $('clear-recommendations').hidden = !saved;
  if (!saved || !saved.items.length) {
    EasyUI.empty($('recommendations'), saved ? 'No suitable recipe ideas this time.' : 'Your next meal starts with an idea.',
      saved ? 'Try another category or more common ingredient names.' : 'Choose a category or add ingredients to get started.');
  } else $('recommendations').replaceChildren(...saved.items.map(item =>
    EasyUI.card(new EasyCore.Recipe(item.recipe), openRecipe, addToPlan, item)));
  $('recommendation-meta').textContent = saved ?
    'Saved ' + new Date(saved.savedAt).toLocaleString() + ' · ' + saved.category +
      (saved.ingredients ? ' · Pantry: ' + saved.ingredients : '') + ' · ' + (saved.scope || 'Restored from this device.') :
    'Your latest recommendations will be saved on this device.';
}
async function generateSuggestions(event) {
  event.preventDefault();
  const category = $('category').value, text = $('ingredients').value.trim();
  let available;
  try { available = EasyCore.parseIngredients(text);
    if (category === 'All' && !available.length) throw new Error('Choose a category or enter available ingredients first.');
  } catch (err) { notice(err.message, true); return; }
  $('suggest-button').disabled = true; EasyUI.busy($('recommendations'), 'Comparing recipes with your kitchen…');
  try {
    const recipes = offlineMode ? await loadOffline() : await service.candidates(category, available);
    const items = EasyCore.suggestRecipes(recipes, category, available);
    const scope = offlineMode ? 'Compared the 8 bundled recipes.' :
      'Compared up to 24 candidates' + (available.length ? ' discovered using your first 3 ingredients' : ' from this category') +
      '; ranked locally using all your ingredients.';
    const saved = { category, ingredients: text, savedAt: new Date().toISOString(), scope, items };
    store.write('recommendations', saved); savedRecommendations = saved; renderRecommendations();
    notice(items.length ? items.length + ' recipe ideas saved on this device.' : 'No suitable recipes found. Try another category or ingredient.');
  } catch (err) { renderRecommendations(); notice(err.message, true); }
  finally { $('suggest-button').disabled = false; }
}
$('search-form').addEventListener('submit', event => { event.preventDefault(); searchRecipes(); });
$('category').addEventListener('change', searchRecipes);
$('load-more').addEventListener('click', () => { shown = Math.min(shown + 9, current.length); displayResults(); });
$('suggest-form').addEventListener('submit', generateSuggestions);
$('offline').addEventListener('click', () => {
  if (offlineMode) initialize(); else useOffline();
});
$('surprise').addEventListener('click', async () => {
  $('surprise').disabled = true;
  try { const recipe = offlineMode ? offlineRecipes[Math.floor(Math.random() * offlineRecipes.length)] : await service.random();
    EasyUI.showRecipe(recipe, addToPlan);
  } catch (err) { notice(err.message, true); }
  finally { $('surprise').disabled = false; }
});
$('close-plan').addEventListener('click', () => $('plan-dialog').close());
$('quick-plan-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (!selectedRecipe) throw new Error('Choose a recipe first.');
    store.savePlan({ title: selectedRecipe.name, recipe: selectedRecipe, date: $('quick-date').value,
      slot: $('quick-slot').value, servings: $('quick-servings').value, notes: $('quick-notes').value });
    $('plan-dialog').close(); notice('Meal saved. Open Meal Planner to view or edit it.');
  } catch (err) { $('quick-error').textContent = err.message; }
});
$('clear-recommendations').addEventListener('click', () => {
  try { localStorage.removeItem('easycook.recommendations.v1'); savedRecommendations = null;
    renderRecommendations(); notice('Saved recommendations cleared.'); }
  catch { notice('Could not clear recommendations. Storage is unavailable.', true); }
});
async function initialize() {
  $('offline').disabled = true;
  try {
    const categories = await service.categories();
    offlineMode = false; setCategories(categories);
    $('source-label').textContent = 'Live recipes · TheMealDB';
    $('offline').textContent = 'Use offline collection';
    await searchRecipes();
  } catch (err) {
    notice(err.message + ' You can use the offline collection while disconnected.', true);
    $('source-label').textContent = 'Live service unavailable · offline collection ready';
    try { await loadOffline(); } catch {}
    EasyUI.empty($('results'), 'The recipe service is unavailable.', 'Choose “Use offline collection” to keep exploring.');
  } finally { $('offline').disabled = false; }
}
renderRecommendations();
initialize();
