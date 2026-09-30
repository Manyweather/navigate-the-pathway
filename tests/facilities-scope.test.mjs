import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneFacilitiesDemoState } from '../app/production/facilities-demo-model.ts';
import { summerlinFacilitiesState, mergeSummerlinFacilitiesState } from '../app/production/facilities-scope.ts';

test('active Facilities records and their linked notifications are Summerlin only',()=>{
  const source=cloneFacilitiesDemoState(), active=summerlinFacilitiesState(source);
  assert.ok(active.rooms.length>0);
  assert.ok(active.rooms.length<source.rooms.length);
  assert.ok(active.rooms.every(room=>room.building==='Summerlin Campus'));
  assert.ok(active.reservations.every(row=>active.rooms.some(room=>room.id===row.roomId)));
  assert.ok(active.mapUploads.every(row=>row.campus==='Summerlin Campus'));
  const ids=new Set([...active.requests,...active.reservations,...active.supplyRequests,...active.keyRequests].map(row=>row.id));
  assert.ok(active.notifications.every(row=>ids.has(row.recordId)));
});

test('editing a Summerlin record preserves inactive Henderson records and staff edits',()=>{
  const source=cloneFacilitiesDemoState(), active=summerlinFacilitiesState(source);
  const hidden=source.rooms.filter(room=>!active.rooms.some(row=>row.id===room.id));
  hidden[0].name='Preserved reference correction';
  const changed={...active,rooms:active.rooms.map((row,index)=>index===0?{...row,name:'Summerlin correction'}:row)};
  const merged=mergeSummerlinFacilitiesState(source,changed);
  assert.equal(merged.rooms.find(row=>row.id===active.rooms[0].id).name,'Summerlin correction');
  assert.deepEqual(merged.rooms.filter(row=>hidden.some(ref=>ref.id===row.id)),hidden);
  assert.deepEqual(source.rooms.find(row=>row.id===active.rooms[0].id).name,active.rooms[0].name);
});
