'use strict';
const { $, h, notice, store } = EasyUI;
let editingId = null, linkedRecipe = null, deletingId = null;
$('meal-date').value = EasyCore.localDate();

function resetEditor() {
  editingId = null; linkedRecipe = null; $('meal-form').reset();
  $('meal-date').value = EasyCore.localDate(); $('meal-servings').value = '2';
  $('editor-title').textContent = 'Add a meal'; $('save-meal').textContent = 'Save meal';
  $('cancel-edit').hidden = true; $('form-error').textContent = '';
  $('linked-recipe').textContent = 'Add a personal meal, or choose a recipe from the Explorer.';
}
function editPlan(plan) {
  editingId = plan.id; linkedRecipe = plan.recipe;
  $('meal-title').value = plan.title; $('meal-date').value = plan.date;
  $('meal-slot').value = plan.slot; $('meal-servings').value = plan.servings; $('meal-notes').value = plan.notes;
  $('editor-title').textContent = 'Edit your meal'; $('save-meal').textContent = 'Update meal';
  $('cancel-edit').hidden = false; $('form-error').textContent = '';
  $('linked-recipe').textContent = plan.recipe ? 'Linked recipe: ' + plan.recipe.name : 'Personal meal · no linked recipe';
  $('meal-title').focus(); $('meal-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function askDelete(plan) {
  deletingId = plan.id; $('delete-description').textContent = 'Remove “' + plan.title + '” from ' + plan.date + '?';
  $('delete-dialog').showModal();
}
function renderPlans() {
  const all = store.plans();
  $('stat-meals').textContent = all.length;
  $('stat-servings').textContent = all.reduce((sum, p) => sum + p.servings, 0);
  $('stat-days').textContent = new Set(all.map(p => p.date)).size;
  const slots = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const plans = all.filter(p => (!$('filter-date').value || p.date === $('filter-date').value) &&
    ($('filter-slot').value === 'All' || p.slot === $('filter-slot').value))
    .sort((a, b) => a.date.localeCompare(b.date) || slots.indexOf(a.slot) - slots.indexOf(b.slot) || a.title.localeCompare(b.title));
  $('plans').replaceChildren();
  if (!plans.length) {
    EasyUI.empty($('plans'), all.length ? 'No meals match these filters.' : 'A fresh page for your next meal.',
      all.length ? 'Reset the filters to see your whole menu.' : 'Add a meal here, or pick a recipe in the Explorer.'); return;
  }
  let day = '';
  for (const plan of plans) {
    if (day !== plan.date) {
      day = plan.date;
      $('plans').append(h('div', { class: 'plan-group' }, new Date(day + 'T12:00:00').toLocaleDateString(undefined,
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));
    }
    const actions = [];
    if (plan.recipe) actions.push(h('button', { class: 'text-button', onclick: () =>
      EasyUI.showRecipe(new EasyCore.Recipe(plan.recipe), null, plan.servings) }, 'View saved recipe ↗'));
    actions.push(h('button', { class: 'secondary', onclick: () => editPlan(plan) }, 'Edit meal'),
      h('button', { class: 'text-button', onclick: () => askDelete(plan) }, 'Remove'));
    $('plans').append(h('article', { class: 'plan-card' }, [
      h('div', { class: 'card-meta' }, [h('span', { class: 'badge' }, plan.slot),
        h('span', {}, plan.servings + ' serving' + (plan.servings === 1 ? '' : 's'))]),
      h('h3', {}, plan.title), plan.notes ? h('p', {}, plan.notes) : null,
      h('div', { class: 'actions' }, actions)
    ]));
  }
}
$('meal-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const wasEditing = !!editingId;
    store.savePlan({ title: $('meal-title').value, date: $('meal-date').value, slot: $('meal-slot').value,
      servings: $('meal-servings').value, notes: $('meal-notes').value, recipe: linkedRecipe }, editingId);
    resetEditor(); renderPlans(); notice(wasEditing ? 'Meal updated and saved on this device.' : 'Meal added and saved on this device.');
  } catch (err) { $('form-error').textContent = err.message; }
});
$('cancel-edit').addEventListener('click', resetEditor);
$('confirm-delete').addEventListener('click', () => {
  try { store.deletePlan(deletingId); if (editingId === deletingId) resetEditor();
    $('delete-dialog').close(); deletingId = null; renderPlans(); notice('Meal removed from your plan.'); }
  catch (err) { $('delete-dialog').close(); notice(err.message, true); }
});
$('cancel-delete').addEventListener('click', () => $('delete-dialog').close());
$('filter-date').addEventListener('change', renderPlans);
$('filter-slot').addEventListener('change', renderPlans);
$('reset-filters').addEventListener('click', () => { $('filter-date').value = ''; $('filter-slot').value = 'All'; renderPlans(); });
window.addEventListener('storage', event => { if (event.key === 'easycook.plans.v1') renderPlans(); });
renderPlans();
