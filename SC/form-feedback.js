/* Keep native constraints and submission rules, replacing only browser popups. */
(() => {
  let nextId=0,focusPending=false;
  const ar=()=>document.documentElement.lang==='ar',t=(en,a)=>ar()?a:en;
  function message(field){
    if(field.validity.valueMissing)return t('Please fill out this field','يرجى ملء هذا الحقل');
    if(field.validity.typeMismatch&&field.type==='email')return t('Please enter a valid email address','يرجى إدخال بريد إلكتروني صحيح');
    if(field.validity.rangeUnderflow||field.validity.rangeOverflow)return t('Please enter a value within the allowed range','يرجى إدخال قيمة ضمن النطاق المسموح');
    if(field.validity.tooShort)return t('Please enter a longer value','يرجى إدخال قيمة أطول');
    return t('Please check the format of this value','يرجى التحقق من تنسيق هذه القيمة');
  }
  document.addEventListener('invalid',event=>{
    const field=event.target;if(field.closest('#editor-form[data-kind=offer]'))return;
    event.preventDefault();field.setAttribute('aria-invalid','true');
    let note=document.getElementById(field.dataset.feedbackId);
    if(!note){note=document.createElement('span');note.className='scms-field-error';note.id='scms-field-error-'+(++nextId);note.setAttribute('role','alert');field.dataset.feedbackId=note.id;(field.closest('.guest-tracking-controls')||field).after(note);field.setAttribute('aria-describedby',[field.getAttribute('aria-describedby'),note.id].filter(Boolean).join(' '));}
    note.textContent=message(field);
    if(!focusPending){focusPending=true;queueMicrotask(()=>{focusPending=false;field.focus();});}
  },true);
  function clear(event){const field=event.target;if(!field.dataset.feedbackId||!field.validity?.valid)return;const id=field.dataset.feedbackId;document.getElementById(id)?.remove();field.removeAttribute('aria-invalid');const remaining=(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(v=>v&&v!==id).join(' ');if(remaining)field.setAttribute('aria-describedby',remaining);else field.removeAttribute('aria-describedby');delete field.dataset.feedbackId;}
  document.addEventListener('input',clear);document.addEventListener('change',clear);
})();
