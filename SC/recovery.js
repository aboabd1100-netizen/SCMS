/* Reuse the existing recovery page when following a single-use emailed link. */
(() => {
  const token=new URLSearchParams(location.search).get('token');if(!token)return;
  function upgrade(){const form=document.querySelector('#forgot-form');if(!form||form.dataset.resetReady)return;form.dataset.resetReady='true';const ar=document.documentElement.lang==='ar';form.innerHTML=`<label>${ar?'كلمة المرور الجديدة':'New Password'}<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label><label>${ar?'تأكيد كلمة المرور':'Confirm Password'}<input name="confirm" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label><div class="form-error" role="alert"></div><button class="primary-btn" type="submit">${ar?'إعادة تعيين كلمة المرور':'Reset Password'}</button>`;}
  upgrade();new MutationObserver(upgrade).observe(document.body,{childList:true,subtree:true});
})();
