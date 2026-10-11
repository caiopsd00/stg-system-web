import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timeParts,timeValue,timeInputValue} from '../src/brlift/time-utils.ts';
test('horários preservam HH:mm, meia-noite e minutos não múltiplos de cinco',()=>{
 for(const value of ['00:00','08:07','23:59'])assert.equal(timeValue(timeParts(value)),value);
 assert.equal(timeValue(timeParts('8:3')),'08:03');
});
test('horários rejeitam limites inválidos e preenchimento parcial',()=>{
 for(const value of ['24:00','08:60','-1:00','aa:bb','12:',''])assert.equal(timeValue(timeParts(value)),'');
 assert.equal(timeValue(['12','']),'');
 assert.equal(timeInputValue(['12','']),'12:');
 assert.deepEqual(timeParts('12:'),['12','']);
 assert.equal(timeInputValue(['24','00']),'24:00');
 assert.equal(timeInputValue(['','']),'');
});
