#!/usr/bin/env node
// Delete the service domain that was generated pre-deploy (targetPort null,
// edge 502 across three healthy deploys) so it can be recreated with an
// explicit -p 8000. Settings-only; no secrets.
import fs from 'node:fs';
import os from 'node:os';
const cfg = JSON.parse(fs.readFileSync(os.homedir() + '/.railway/config.json', 'utf8'));
const token = cfg?.user?.token || cfg?.user?.accessToken;
const ID = '0bb46b53-046f-4ba5-bff6-66799888e0f3'; // from ops/set-domain-target-port.mjs output
const res = await fetch('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    query: 'mutation($id:String!){ serviceDomainDelete(id:$id) }',
    variables: { id: ID },
  }),
});
const j = await res.json();
if (j.errors) { console.error(JSON.stringify(j.errors)); process.exit(1); }
console.log('deleted:', JSON.stringify(j.data));
