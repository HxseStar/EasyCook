/* Shared DOM construction. API and user text are inserted with textContent, never HTML. */
const EasyUI = (() => {
  const $ = id => document.getElementById(id);
  function h(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
      else if (key === 'class') element.className = value;
      else element.setAttribute(key, value);
    }
    for (const child of [children].flat(Infinity)) {
      if (child !== null && child !== undefined) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }
  function notice(message, error = false) {
    const box = $('notice'); box.textContent = message;
    box.classList.toggle('error', error); box.hidden = false;
  }
  const store = new EasyStore(localStorage, notice);
  function image(recipe, className = '') {
    let source = 'assets/bowl.svg';
    try { const u = new URL(recipe.image);
      if (u.protocol === 'https:' && u.hostname === 'www.themealdb.com') source = u.href;
    } catch {}
    const img = h('img', { src: source, alt: recipe.name, class: className, loading: 'lazy' });
    img.addEventListener('error', () => { if (!img.src.endsWith('/assets/bowl.svg')) img.src = 'assets/bowl.svg'; }, { once: true });
    return img;
  }
  function empty(container, title, message) {
    container.replaceChildren(h('div', { class: 'empty' }, [h('h3', {}, title), h('p', {}, message)]));
  }
  function busy(container, text = 'Finding something delicious…') {
    container.replaceChildren(h('div', { class: 'busy', role: 'status' }, text));
  }
  function card(recipe, open, add, recommendation = null) {
    const content = [h('div', { class: 'card-meta' }, [
      h('span', { class: 'badge' }, recipe.category),
      h('span', {}, recipe.area || (recipe.source === 'Offline collection' ? 'Offline collection' : 'TheMealDB'))
    ]), h('h3', {}, recipe.name)];
    if (recommendation) {
      content.push(h('p', { class: 'card-reason' },
        (recommendation.percent !== null ? recommendation.percent + '% match · ' : '') + recommendation.reason));
      if (recommendation.percent !== null) content.push(h('p', { class: 'match-detail' }, [
        h('strong', {}, 'You have: '), recommendation.matched.join(', '),
        h('br'), h('strong', {}, 'Still need: '), recommendation.missing.join(', ') || 'Nothing on this list'
      ]));
    }
    content.push(h('div', { class: 'card-actions' }, [
      h('button', { class: 'text-button', type: 'button', onclick: () => open(recipe) }, 'View recipe ↗'),
      h('button', { class: 'secondary', type: 'button', onclick: () => add(recipe) }, '+ Plan meal')
    ]));
    return h('article', { class: 'recipe-card' }, [image(recipe, 'card-image'), h('div', { class: 'card-body' }, content)]);
  }
  let lastServings = 2;
  function showRecipe(recipe, add = null, plannedServings = 2) {
    lastServings = plannedServings;
    const original = h('input', { id: 'original-servings', type: 'number', min: '1', max: '100', step: '1', value: '2', required: '' });
    const target = h('input', { id: 'target-servings', type: 'number', min: '1', max: '100', step: '1', value: String(plannedServings), required: '' });
    const tableBody = h('tbody'), calcMessage = h('p', { class: 'calc-note', role: 'status', id: 'calculation-result' });
    const error = h('p', { class: 'error-text', role: 'alert' });
    function calculate(event) {
      if (event) event.preventDefault();
      try {
        const base = EasyCore.servingCount(original.value), desired = EasyCore.servingCount(target.value);
        lastServings = desired;
        tableBody.replaceChildren(...recipe.ingredients.map(item => {
          const scaled = EasyCore.scaleMeasure(item.measure, base, desired);
          return h('tr', {}, [h('td', {}, item.name), h('td', {}, item.measure || 'As needed'),
            h('td', { class: scaled.scaled ? '' : 'warning' }, scaled.text + (scaled.scaled ? '' : ' · unchanged'))]);
        }));
        calcMessage.textContent = 'Scale factor: ' + Number((desired / base).toFixed(3)) +
          '× · quantities for ' + desired + ' serving' + (desired === 1 ? '' : 's') + '.';
        error.textContent = '';
      } catch (err) { error.textContent = err.message; }
    }
    const calculator = h('form', { class: 'calculator', onsubmit: calculate }, [
      h('h3', {}, 'Make the right amount'),
      h('p', { class: 'hint' }, 'Enter the recipe’s original serving count. TheMealDB does not provide one; 2 is an editable assumption.'),
      h('div', { class: 'form-row' }, [h('label', {}, ['Original servings', original]),
        h('label', {}, ['Desired servings', target]), h('button', { class: 'primary', type: 'submit' }, 'Calculate')]),
      calcMessage, error
    ]);
    const actions = [h('span', { class: 'hint' }, 'Source: ' + recipe.source)];
    if (add) actions.push(h('button', { class: 'primary', onclick: () => {
      try { lastServings = EasyCore.servingCount(target.value); }
      catch (err) { error.textContent = err.message; return; }
      $('recipe-dialog').close(); add(recipe, lastServings);
    } }, '+ Add to meal plan'));
    $('recipe-content').replaceChildren(
      h('div', { class: 'detail-header' }, [image(recipe), h('div', {}, [
        h('span', { class: 'badge' }, recipe.category + (recipe.area ? ' · ' + recipe.area : '')),
        h('h2', { id: 'recipe-title' }, recipe.name)
      ])]), calculator, h('h3', {}, 'Ingredients'),
      h('table', { class: 'ingredients-table' }, [
        h('thead', {}, h('tr', {}, [h('th', {}, 'Ingredient'), h('th', {}, 'Original amount'), h('th', {}, 'Scaled amount')])), tableBody
      ]), h('p', { class: 'hint' }, 'Text amounts and ranges stay unchanged. Values are rounded to 3 decimal places; units are preserved.'),
      h('h3', {}, 'Let’s get cooking'), h('div', { class: 'instructions' }, recipe.instructions || 'No instructions supplied.'),
      h('div', { class: 'detail-actions' }, actions)
    );
    calculate(); $('recipe-dialog').showModal();
  }
  $('close-recipe')?.addEventListener('click', () => $('recipe-dialog').close());
  return { $, h, notice, store, image, empty, busy, card, showRecipe };
})();
