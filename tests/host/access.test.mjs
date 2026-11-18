import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedRequest } from '../../src/host/access.mjs';
const req=(headers={},method='GET',ip='127.0.0.1')=>({headers:{host:'127.0.0.1:3097',...headers},method,socket:{remoteAddress:ip}});
test('loopback same-origin requests pass; remote and rebinding requests fail',()=>{
  assert.equal(allowedRequest(req(),'http://127.0.0.1:3097'),true);
  for(const r of [req({host:'evil.example:3097'}),req({origin:'https://evil.example'}),req({},'GET','192.168.1.2'),req({'sec-fetch-site':'cross-site'})]) assert.equal(allowedRequest(r,'http://127.0.0.1:3097'),false);
});
test('mutation requires custom header and rejects null origin',()=>{
  assert.equal(allowedRequest(req({},'POST'),'http://127.0.0.1:3097'),false);
  assert.equal(allowedRequest(req({'x-learning-workbench':'1'},'POST'),'http://127.0.0.1:3097'),true);
  assert.equal(allowedRequest(req({origin:'null','x-learning-workbench':'1'},'POST'),'http://127.0.0.1:3097'),false);
});
