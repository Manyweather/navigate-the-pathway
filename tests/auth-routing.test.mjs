import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { clearStoredPreview, hasAuthenticationCallback, safeAppDestination } from "../app/production/auth-intent.ts";
import { pilotAuthTestHelpers } from "../cloudflare/pilot-api.ts";

test("authentication callback parameters take precedence over a stored demo", () => {
  assert.equal(hasAuthenticationCallback("?code=pkce-code&preview=impact", ""), true);
  assert.equal(hasAuthenticationCallback("?preview=impact", "#access_token=token&type=recovery"), true);
  assert.equal(hasAuthenticationCallback("?preview=impact", ""), false);
  const removed = [];
  clearStoredPreview({ removeItem: (key) => removed.push(key) });
  assert.deepEqual(removed.sort(), ["navigate.synthetic-pilot-persona.v1", "navigate.synthetic-pilot-preview", "navigate.synthetic-pilot-scope.v1"].sort());
});

test("post-authentication navigation stays inside the application", () => {
  assert.equal(safeAppDestination("%2Fapp%2Fcompass"), "/app/compass");
  assert.equal(safeAppDestination("https://attacker.example"), "/app");
  assert.equal(safeAppDestination("//attacker.example/app"), "/app");
});

test("only the configured Roseman provider can satisfy the SAML MFA policy", () => {
  const trusted = pilotAuthTestHelpers.authenticationFacts({ aal: "aal1", amr: [{ method: "sso/saml", provider: "roseman-provider" }] }, { trustedProviderId: "roseman-provider", trustRosemanSamlAsMfa: true });
  const wrongProvider = pilotAuthTestHelpers.authenticationFacts({ aal: "aal1", amr: [{ method: "sso/saml", provider: "other-provider" }] }, { trustedProviderId: "roseman-provider", trustRosemanSamlAsMfa: true });
  const gmailAal1 = pilotAuthTestHelpers.authenticationFacts({ aal: "aal1", amr: [{ method: "password" }] }, { trustedProviderId: "roseman-provider", trustRosemanSamlAsMfa: true });
  const gmailAal2 = pilotAuthTestHelpers.authenticationFacts({ aal: "aal2", amr: [{ method: "totp" }] }, { trustedProviderId: "roseman-provider", trustRosemanSamlAsMfa: true });
  assert.equal(trusted.mfaSatisfied, true);
  assert.equal(wrongProvider.mfaSatisfied, false);
  assert.equal(gmailAal1.mfaSatisfied, false);
  assert.equal(gmailAal2.mfaSatisfied, true);
});

test("staff SAML migration requires exact roster matching and preserves a pending gate", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202609230006_staff_saml_access.sql", import.meta.url), "utf8");
  assert.match(sql, /pending_record\.email<>roster_record\.email/);
  assert.match(sql, /More than one pending identity uses this email/);
  assert.match(sql, /status text not null default 'pending'/);
  assert.match(sql, /sso_identity_roster_approved/);
  assert.match(sql, /method->>'provider'=c\.roseman_sso_provider_id::text/);
});

