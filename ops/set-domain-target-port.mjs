#!/usr/bin/env node
// Point the service domain at the app's port (8000). The domain was generated
// before the first deploy, so Railway pinned a wrong/unset target port → edge 502
// while the container is Online. Settings-only mutation; no secret values touched.
// Token: the Railway CLI's own session, same as stanton-control's provisioners.
import fs from 'node:fs';
import os from 'node:os';

const cfg = JSON.parse(fs.readFileSync(os.homedir() + '/.railway/config.json', 'utf8'));
const token = cfg?.user?.token || cfg?.user?.accessToken;
if (!token) { console.error('no railway CLI token'); process.exit(1); }
const PROJECT = 'fdea698d-dd17-4d7e-b300-622a8d152186'; // sms-foundation-agent
const TARGET_PORT = 8000;

async function gql(query, variables) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors.map(e => e.message)));
  return j.data;
}

const proj = await gql(`query($id:String!){ project(id:$id){
  environments{edges{node{id name}}}
  services{edges{node{id name}}}
}}`, { id: PROJECT });
const env = proj.project.environments.edges.find(e => e.node.name === 'production').node;
const svc = proj.project.services.edges.find(s => s.node.name === 'sms-foundation-agent').node;

const doms = await gql(`query($p:String!,$e:String!,$s:String!){ domains(projectId:$p, environmentId:$e, serviceId:$s){
  serviceDomains{ id domain targetPort }
}}`, { p: PROJECT, e: env.id, s: svc.id });
console.log('current:', JSON.stringify(doms.domains.serviceDomains));
for (const d of doms.domains.serviceDomains) {
  await gql(`mutation($i:ServiceDomainUpdateInput!){ serviceDomainUpdate(input:$i) }`,
    { i: { serviceDomainId: d.id, targetPort: TARGET_PORT } });
  console.log(`${d.domain}: targetPort ${d.targetPort} -> ${TARGET_PORT}`);
}
console.log('done');
