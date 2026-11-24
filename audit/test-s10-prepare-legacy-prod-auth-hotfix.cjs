#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const {patchLegacy}=require("./s10-prepare-legacy-prod-auth-hotfix.cjs");
const fake=`
<script>
  // Pas connecté -> dehors
  if (!session){
    window.location.replace("login.html");
  }
/* ===================== AUTH SUPABASE ===================== */
async function supabaseLogin(){
  const email = "fake@example.invalid";
  const password = "fake-not-real";
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });
  if (error){
    console.error("Supabase login error:", error.message);
    alert("Erreur connexion cloud");
    return;
  }
  SUPABASE_USER = data.user;
  console.log("Supabase connecté", SUPABASE_USER.email);
}
(async function initApp(){
  await supabaseLogin();
  await loadCloudData();
})();
</script>`;
const result=patchLegacy(fake);
assert.ok(!result.includes("fake-not-real"));
assert.ok(!result.includes("fake@example.invalid"));
assert.ok(!result.includes("sb.auth.signInWithPassword"));
assert.ok(result.includes("sb.auth.getUser()"));
assert.ok(result.includes('if(!await supabaseLogin())return'));
assert.ok(!result.includes("if (!session)"));
assert.throws(()=>patchLegacy(result),/AUTH_HOTFIX_REFUSED/);
assert.throws(()=>patchLegacy(fake.replace('const password = "fake-not-real";','const password = someVariable;')),/AUTH_HOTFIX_REFUSED/);
assert.throws(()=>patchLegacy(fake.replace("await loadCloudData();","await somethingElse();")),/AUTH_HOTFIX_REFUSED/);
console.log("LEGACY_PROD_AUTH_HOTFIX_OFFLINE_SYNTHETIC_PASS");
