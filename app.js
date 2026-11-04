'use strict';
const KEY='money-from-mom-v1', DEFAULT_BUDGET=60000;
const $=id=>document.getElementById(id);
const localDate=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const monthKey=date=>date.slice(0,7);
let currentMonth = monthKey(localDate());
let selected = currentMonth, items = [], budgetChanges = {}, deleted = null, timer;
let editingMonth = null, storageError = false;
const money=cents=>new Intl.NumberFormat('he-IL',{maximumFractionDigits:2}).format(cents/100)+' ₪';
function valid(item){return item&&typeof item.id==='string'&&typeof item.store==='string'&&item.store.trim().length>0&&item.store.length<=100&&Number.isSafeInteger(item.cents)&&item.cents>0&&item.cents<=99999900&&typeof item.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&localDate(new Date(item.date+'T12:00:00'))===item.date;}
function notify(message,undo=false){clearTimeout(timer);$('toast-text').textContent=message;$('undo').hidden=!undo;$('toast').hidden=false;timer=setTimeout(()=>{$('toast').hidden=true;},undo?12000:5000);}
function validBudget(cents) {
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 99999900;
}

function readBackup(data) {
  if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.items) ||
      !data.items.every(valid) || new Set(data.items.map(item => item.id)).size !== data.items.length) {
    throw Error('Invalid purchases');
  }
  const changes = data.version === 1 ? {} : data.budgetChanges;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
      !Object.entries(changes).every(([month, cents]) =>
        /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && validBudget(cents))) {
    throw Error('Invalid monthly amounts');
  }
  return {items: data.items, budgetChanges: changes};
}

function readStored() {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return {items: [], budgetChanges: {}};
  const data = JSON.parse(raw);
  return readBackup(Array.isArray(data) ? {version: 1, items: data} : data);
}

function protectData() {
  storageError = true;
  closeBudgetEditor();
  $('purchase-form').querySelector('button').disabled = true;
  $('edit-budget').disabled = true;
  $('form-error').textContent = 'כדי להגן על הנתונים, יש לשחזר גיבוי לפני ביצוע שינויים.';
  notify('לא הצלחנו לקרוא את הנתונים השמורים. אפשר לשחזר מגיבוי.');
}

function applyState(state) {
  ({items, budgetChanges} = state);
  if (storageError) {
    storageError = false;
    $('purchase-form').querySelector('button').disabled = false;
    $('edit-budget').disabled = false;
    $('form-error').textContent = '';
  }
  render();
}

function persist(update, restoring = false) {
  let state;
  try {
    state = readStored();
  } catch {
    if (!restoring) {
      protectData();
      return false;
    }
    state = {items, budgetChanges};
  }
  const next = update(state);
  try {
    localStorage.setItem(KEY, JSON.stringify({version: 2, ...next}));
  } catch {
    notify('השמירה לא הצליחה. נסי לפנות מקום בדפדפן ולשמור שוב.');
    return false;
  }
  applyState(next);
  return true;
}

function budgetFor(month) {
  const effectiveMonth = Object.keys(budgetChanges).filter(key => key <= month).sort().pop();
  return budgetChanges[effectiveMonth] ?? DEFAULT_BUDGET;
}

function closeBudgetEditor(focus = false) {
  editingMonth = null;
  $('budget-form').hidden = true;
  $('edit-budget').setAttribute('aria-expanded', 'false');
  $('budget-error').textContent = '';
  $('budget-amount').removeAttribute('aria-invalid');
  if (focus) $('edit-budget').focus();
}

function render() {
  const [year, month] = selected.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const monthName = new Intl.DateTimeFormat('he-IL', {month: 'long', year: 'numeric'}).format(date);
  $('month').textContent = monthName;
  const end = new Date(year, month, 0);
  $('period').textContent = `1.${month}.${year} עד ${end.getDate()}.${month}.${year}`;
  const isCurrent = selected === monthKey(localDate());
  $('today').hidden = isCurrent;
  $('edit-budget').hidden = !isCurrent;
  if (editingMonth && (!isCurrent || editingMonth !== selected)) closeBudgetEditor();

  const list = items.filter(i => monthKey(i.date) === selected)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const budget = budgetFor(selected);
  const spent = list.reduce((sum, item) => sum + item.cents, 0);
  const remaining = budget - spent;
  const ratio = budget ? spent / budget : 0;
  const percent = Math.round(ratio * 100);
  const balance = money(Math.abs(remaining));
  $('remaining').textContent = balance;
  $('remaining').style.setProperty('--balance-length', balance.length);
  $('balance-label').textContent = remaining < 0 ? 'חרגת מהתקציב ב־' : 'נשאר לך החודש';
  document.querySelector('.budget').classList.toggle('over', remaining < 0);
  $('budget-total').textContent = money(budget);
  $('budget-amount-label').textContent = `הסכום החודשי החל מ${monthName}`;
  $('spent').textContent = money(spent);
  $('count').textContent = list.length;
  $('list-total').textContent = money(spent);
  $('percent').textContent = budget ? percent + '%' : '—';
  $('percent').classList.toggle('compact', percent >= 1000);
  $('percent-label').textContent = budget ? 'מהתקציב נוצל' : 'אין תקציב החודש';
  $('arc').style.strokeDashoffset = 427.257 * (1 - Math.min(ratio, 1));
  const ring = document.querySelector('.ring');
  ring.setAttribute('role', budget ? 'progressbar' : 'img');
  ring.setAttribute('aria-label', budget ? 'ניצול התקציב' : 'התקציב החודשי הוא אפס שקלים');
  if (budget) {
    ring.setAttribute('aria-valuemin', 0);
    ring.setAttribute('aria-valuemax', budget / 100);
    ring.setAttribute('aria-valuenow', Math.min(spent, budget) / 100);
    ring.setAttribute('aria-valuetext', `${money(spent)} מתוך ${money(budget)}, ${percent}%`);
  } else {
    for (const attr of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) ring.removeAttribute(attr);
  }
  $('status').textContent = remaining < 0 ? 'כדאי לעצור רגע עם הקניות' :
    !budget ? 'טרם הוקצה כסף לקניות' : remaining === 0 ? 'כל התקציב נוצל' :
    percent >= 80 ? 'מתקרבת לסוף התקציב' : 'יש לך מקום לקניות';
  $('list').replaceChildren();if(!list.length){const empty=document.createElement('div');empty.className='empty';empty.innerHTML='<div class="empty-symbol" aria-hidden="true">＋</div><strong>חודש חדש, דף נקי</strong><p>עוד אין קניות בחודש הזה.<br>הוסיפי קנייה ותראי כמה נשאר לך.</p>';$('list').append(empty);}for(const item of list){const row=document.createElement('div');row.className='purchase';const icon=document.createElement('span');icon.className='store-icon';icon.textContent=item.store.trim()[0];icon.setAttribute('aria-hidden','true');const details=document.createElement('div');details.className='purchase-details';const name=document.createElement('strong');name.textContent=item.store;const when=document.createElement('small');when.textContent=new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'long'}).format(new Date(item.date+'T12:00:00'));details.append(name,when);const price=document.createElement('span');price.className='price';price.textContent=money(item.cents);const remove=document.createElement('button');remove.className='delete';remove.textContent='×';remove.setAttribute('aria-label',`מחיקת הקנייה ב${item.store}, ${money(item.cents)}`);remove.addEventListener('click',()=>{if(persist(state => ({...state, items: state.items.filter(i => i.id !== item.id)}))){deleted=item;notify('הקנייה נמחקה והסכום הוחזר לתקציב',true);}});row.append(icon,details,price,remove);$('list').append(row);}}
function move(delta){const [y,m]=selected.split('-').map(Number);selected=monthKey(localDate(new Date(y,m-1+delta,1)));render();}
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('today').onclick=()=>{selected=monthKey(localDate());render();};$('date').value=localDate();
$('purchase-form').onsubmit=event=>{event.preventDefault();const raw=$('amount').value;const cents=Math.round(Number(raw)*100);const item={id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,cents,store:$('store').value.trim(),date:$('date').value};if(!valid(item)){$('form-error').textContent='הכניסי סכום חיובי, שם חנות ותאריך תקין.';return;}const previous=selected;selected=monthKey(item.date);if(persist(state => ({...state, items: [...state.items, item]}))){$('purchase-form').reset();$('date').value=localDate();$('form-error').textContent='';notify('הקנייה נשמרה');$('amount').focus();}else{selected=previous;render();}};
$('undo').onclick=()=>{if(deleted&&!items.some(i=>i.id===deleted.id)&&persist(state => ({...state, items: state.items.some(i => i.id === deleted.id) ? state.items : [...state.items, deleted]}))){deleted=null;notify('הקנייה הוחזרה');}};
$('edit-budget').onclick = () => {
  refreshMonth();
  if (storageError || selected !== currentMonth) return;
  if (editingMonth) return closeBudgetEditor(true);
  editingMonth = selected;
  $('budget-amount').value = budgetFor(selected) / 100;
  $('budget-form').hidden = false;
  $('edit-budget').setAttribute('aria-expanded', 'true');
  $('budget-amount').focus();
  $('budget-amount').select();
};
$('cancel-budget').onclick = () => closeBudgetEditor(true);
$('budget-form').onkeydown = event => {
  if (event.key === 'Escape') closeBudgetEditor(true);
};
$('budget-form').onsubmit = event => {
  event.preventDefault();
  refreshMonth();
  if (!editingMonth || selected !== currentMonth || storageError) return;
  const input = $('budget-amount');
  const cents = Math.round(input.valueAsNumber * 100);
  if (!input.validity.valid || !validBudget(cents)) {
    $('budget-error').textContent = 'הכניסי סכום בין 0 ל־999,999 ₪, עם עד שתי ספרות אחרי הנקודה.';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  if (persist(state => ({...state, budgetChanges: {...state.budgetChanges, [editingMonth]: cents}}))) {
    closeBudgetEditor(true);
    notify('הסכום החודשי נשמר');
  }
};

$('backup').onclick = () => {
  const blob = new Blob([JSON.stringify({version: 2, items, budgetChanges}, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = `money-from-mom-${localDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$('restore').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5000000) throw Error();
    const backup = readBackup(JSON.parse(await file.text()));
    if (persist(state => {
      const merged = new Map(state.items.map(item => [item.id, item]));
      for (const item of backup.items) if (!merged.has(item.id)) merged.set(item.id, item);
      return {items: [...merged.values()], budgetChanges: {...backup.budgetChanges, ...state.budgetChanges}};
    }, true)) {
      $('form-error').textContent = '';
      notify('הגיבוי שוחזר. הנתונים הקיימים נשמרו.');
    }
  } catch {
    notify('הקובץ אינו גיבוי תקין של האפליקציה.');
  }
  event.target.value = '';
};

function loadState() {
  try {
    applyState(readStored());
  } catch {
    protectData();
    render();
  }
}
window.addEventListener('storage', event => {
  if (event.key === KEY || event.key === null) loadState();
});

function refreshMonth() {
  const now = monthKey(localDate());
  if (now !== currentMonth) {
    if (selected === currentMonth) selected = now;
    currentMonth = now;
    render();
  }
}
function scheduleMonthChange() {
  refreshMonth();
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  setTimeout(scheduleMonthChange, tomorrow - now);
}
window.addEventListener('focus', refreshMonth);
scheduleMonthChange();
loadState();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
